import { httpTimeout, HTTP_TRANSFER_TIMEOUT_MS } from "@/lib/http-timeouts";

// Cliente de GoWA (go-whatsapp-web-multidevice), el contenedor `gowa` del
// compose: WhatsApp NO oficial por QR. Solo se habla con él servidor a
// servidor por la red interna (GOWA_URL) con el Basic Auth compartido
// (GOWA_BASIC_AUTH = "usuario:contraseña"); nunca se expone al navegador —
// su panel y su WebSocket no separan números entre sí. Cada ChannelAccount
// WHATSAPP_WEB es un "device" de GoWA (X-Device-Id = deviceId de sus
// credenciales). Detalle: docs/arquitectura/canales.md → "WhatsApp por QR".

export class GowaError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GowaError";
  }
}

interface GowaEnvelope<T> {
  code?: string | number;
  message?: string;
  results?: T;
}

// Los errores de GoWA llegan en inglés; los que ve una persona se traducen.
export function gowaMessage(raw: string | undefined, status: number): string {
  const msg = raw?.trim() ?? "";
  if (/not log+ed ?in|not logged|you are not loggin/i.test(msg)) return "El número no está vinculado: escanea el código QR en Canales → WhatsApp (QR)";
  if (/not connected|websocket not connected|disconnected/i.test(msg)) return "WhatsApp está desconectado en este momento; intenta de nuevo en unos segundos";
  if (/not (registered|on whatsapp)|is not on whatsapp|invalid jid/i.test(msg)) return "Ese número no tiene WhatsApp";
  if (/device not found/i.test(msg)) return "La conexión de este número ya no existe: elimínalo y vuelve a conectarlo";
  return msg ? `WhatsApp: ${msg}` : `GoWA respondió HTTP ${status}`;
}

function baseUrl(): string | null {
  const url = process.env.GOWA_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

function authHeader(): string | null {
  const raw = process.env.GOWA_BASIC_AUTH?.trim();
  // "colibly:" (contraseña vacía) es el valor del compose cuando falta
  // SERVICE_PASSWORD_GOWA: GoWA no arranca así, el canal no está disponible.
  if (!raw || raw.endsWith(":")) return null;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

/** true si la app tiene cómo hablar con GoWA (URL + contraseña). */
export function isGowaConfigured(): boolean {
  return !!baseUrl() && !!authHeader();
}

function requireConfig(): { base: string; auth: string } {
  const base = baseUrl();
  const auth = authHeader();
  if (!base || !auth) throw new GowaError("WhatsApp por QR no está configurado en este servidor", 503);
  return { base, auth };
}

async function call<T>(
  path: string,
  init: { method?: string; deviceId?: string; json?: unknown; form?: FormData; timeoutMs?: number } = {}
): Promise<T> {
  const { base, auth } = requireConfig();
  const headers: Record<string, string> = { Authorization: auth, Accept: "application/json" };
  if (init.deviceId) headers["X-Device-Id"] = init.deviceId;
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    body = init.form;
  }
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      signal: httpTimeout(init.timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    throw new GowaError(`GoWA no responde: ${err instanceof Error ? err.message : String(err)}`, 503);
  }
  const data = (await res.json().catch(() => null)) as GowaEnvelope<T> | null;
  if (!res.ok || !data || (data.code !== undefined && data.code !== "SUCCESS" && data.code !== 200)) {
    throw new GowaError(gowaMessage(data?.message, res.status), res.status);
  }
  return data.results as T;
}

export interface GowaDevice {
  id: string;
  phone_number?: string;
  display_name?: string;
  state?: "disconnected" | "connecting" | "connected" | "logged_in";
  jid?: string;
}

/** Crea el device con su webhook propio (URL + secreto HMAC por cuenta). */
export async function createDevice(params: { deviceId: string; webhookUrl: string; webhookSecret: string }): Promise<GowaDevice> {
  return call<GowaDevice>("/devices", {
    json: {
      device_id: params.deviceId,
      webhook_url: params.webhookUrl,
      webhook_secret: params.webhookSecret,
      webhook_events: GOWA_WEBHOOK_EVENTS.join(","),
    },
  });
}

/** Eventos que nos interesan; el resto ni sale de GoWA. */
export const GOWA_WEBHOOK_EVENTS = [
  "message",
  "message.ack",
  "message.reaction",
  "message.revoked",
  "device.logged_out",
  "device.temporary_ban",
  "device.reachout_timelock",
  // Cambio de nombre de un grupo (solo cuenta con groupsEnabled).
  "group.info",
] as const;

/**
 * Vuelve a registrar el webhook del device con la lista de eventos actual
 * (GOWA_WEBHOOK_EVENTS). Los devices creados antes de un evento nuevo no lo
 * reciben hasta pasar por aquí: lo hace el interruptor de grupos.
 */
export async function setDeviceWebhook(deviceId: string, params: { webhookUrl: string; webhookSecret: string }): Promise<void> {
  await call(`/devices/${encodeURIComponent(deviceId)}/webhook`, {
    method: "PATCH",
    json: { webhook_url: params.webhookUrl, webhook_secret: params.webhookSecret, webhook_events: GOWA_WEBHOOK_EVENTS.join(",") },
  });
}

export async function getDevice(deviceId: string): Promise<GowaDevice> {
  return call<GowaDevice>(`/devices/${encodeURIComponent(deviceId)}`);
}

export async function getDeviceStatus(deviceId: string): Promise<{ isConnected: boolean; isLoggedIn: boolean }> {
  const r = await call<{ is_connected?: boolean; is_logged_in?: boolean }>(`/devices/${encodeURIComponent(deviceId)}/status`);
  return { isConnected: !!r?.is_connected, isLoggedIn: !!r?.is_logged_in };
}

/**
 * Pide un QR nuevo y lo devuelve como data URL: el PNG vive en GoWA (red
 * interna) y el navegador nunca habla con GoWA.
 */
export async function getLoginQr(deviceId: string): Promise<{ dataUrl: string; expiresInSeconds: number }> {
  const r = await call<{ qr_link?: string; qr_duration?: number }>(`/devices/${encodeURIComponent(deviceId)}/login`);
  if (!r?.qr_link) throw new GowaError("GoWA no devolvió el código QR", 502);
  const png = await fetchInternalFile(r.qr_link);
  return { dataUrl: `data:image/png;base64,${png.buffer.toString("base64")}`, expiresInSeconds: r.qr_duration ?? 30 };
}

/** Vinculación con código de 8 caracteres (alternativa al QR). */
export async function getPairingCode(deviceId: string, phone: string): Promise<string> {
  const r = await call<{ pair_code?: string }>(
    `/devices/${encodeURIComponent(deviceId)}/login/code?phone=${encodeURIComponent(phone)}`,
    { method: "POST" }
  );
  if (!r?.pair_code) throw new GowaError("GoWA no devolvió el código de vinculación", 502);
  return r.pair_code;
}

export async function logoutDevice(deviceId: string): Promise<void> {
  await call(`/devices/${encodeURIComponent(deviceId)}/logout`, { method: "POST" });
}

export async function deleteDevice(deviceId: string): Promise<void> {
  await call(`/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
}

interface SendResult {
  message_id?: string;
}

export async function sendText(deviceId: string, params: { to: string; body: string; replyToId?: string }): Promise<string | null> {
  const r = await call<SendResult>("/send/message", {
    deviceId,
    json: { phone: params.to, message: params.body, ...(params.replyToId ? { reply_message_id: params.replyToId } : {}) },
  });
  return r?.message_id ?? null;
}

export type GowaMediaKind = "image" | "video" | "audio" | "document";

const SEND_PATH: Record<GowaMediaKind, { path: string; field: string }> = {
  image: { path: "/send/image", field: "image" },
  video: { path: "/send/video", field: "video" },
  audio: { path: "/send/audio", field: "audio" },
  document: { path: "/send/file", field: "file" },
};

export async function sendMedia(
  deviceId: string,
  params: { to: string; kind: GowaMediaKind; buffer: Buffer; filename: string; mimeType: string; caption?: string; replyToId?: string }
): Promise<string | null> {
  const { path, field } = SEND_PATH[params.kind];
  const form = new FormData();
  form.set("phone", params.to);
  if (params.caption && params.kind !== "audio") form.set("caption", params.caption);
  if (params.replyToId) form.set("reply_message_id", params.replyToId);
  form.set(field, new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }), params.filename);
  const r = await call<SendResult>(path, { deviceId, form, timeoutMs: HTTP_TRANSFER_TIMEOUT_MS });
  return r?.message_id ?? null;
}

/** Descarga el archivo de un mensaje entrante (GoWA lo baja de WhatsApp y lo sirve). */
export async function downloadMessageMedia(
  deviceId: string,
  messageId: string,
  chatJid: string
): Promise<{ buffer: Buffer; mimeType: string | null; filename: string | null }> {
  const r = await call<{ file_url?: string; file_path?: string; filename?: string }>(
    `/message/${encodeURIComponent(messageId)}/download?phone=${encodeURIComponent(chatJid)}`,
    { deviceId, timeoutMs: HTTP_TRANSFER_TIMEOUT_MS }
  );
  const target = r?.file_url || (r?.file_path ? `${requireConfig().base}/${r.file_path.replace(/^\/+/, "")}` : null);
  if (!target) throw new GowaError("GoWA no devolvió el archivo", 502);
  const file = await fetchInternalFile(target);
  return { buffer: file.buffer, mimeType: file.mimeType, filename: r?.filename ?? null };
}

// Los enlaces que devuelve GoWA (QR, medios) apuntan a su propio host. Solo se
// sigue un enlace del MISMO origen que GOWA_URL: nunca un fetch a otra parte.
async function fetchInternalFile(link: string): Promise<{ buffer: Buffer; mimeType: string | null }> {
  const { base, auth } = requireConfig();
  const target = new URL(link, base);
  if (target.origin !== new URL(base).origin) throw new GowaError("GoWA devolvió un enlace fuera de su origen", 502);
  const res = await fetch(target, { headers: { Authorization: auth }, signal: httpTimeout(HTTP_TRANSFER_TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new GowaError(`No se pudo descargar el archivo de GoWA (HTTP ${res.status})`, 502);
  const mimeType = res.headers.get("content-type")?.split(";")[0].trim() || null;
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType };
}

/**
 * Nombre de un grupo (GET /group/info). GoWA devuelve el GroupInfo de
 * whatsmeow sin esquema fijo ("structure may vary"): se acepta `Name` o `name`.
 * null si no lo trae; el llamador deja el JID y group.info lo corrige después.
 */
export async function getGroupName(deviceId: string, groupJid: string): Promise<string | null> {
  const r = await call<Record<string, unknown> | null>(`/group/info?group_id=${encodeURIComponent(groupJid)}`, { deviceId });
  const name = r && (r.Name ?? r.name ?? r.subject ?? r.Subject);
  return typeof name === "string" && name.trim() ? name.trim().slice(0, 200) : null;
}

/** Diagnóstico: GoWA responde con nuestras credenciales. */
export async function gowaInfo(): Promise<{ version: string | null }> {
  const r = await call<{ version?: string }>("/app/info");
  return { version: r?.version ?? null };
}
