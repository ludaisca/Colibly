import { createHmac, timingSafeEqual } from "crypto";

// Lógica pura del webhook de GoWA (sin red ni base de datos) — probada en
// lib/gowa/__tests__/webhook.test.ts. La ruta app/api/gowa/webhook/[accountId]
// solo autentica, llama a parseGowaEvent() y persiste.

/** `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 del cuerpo crudo con el secreto del device. */
export function gowaSignatureValid(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const received = header.replace(/^sha256=/, "").trim();
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

// ── Direcciones de WhatsApp ─────────────────────────────────────────────

const PERSONAL = /@s\.whatsapp\.net$/;
const LID = /@lid$/;

/** Solo chats 1:1: grupos, canales, estados y difusiones no entran a la bandeja. */
export function isDirectChat(jid: string | null | undefined): boolean {
  return !!jid && (PERSONAL.test(jid) || LID.test(jid));
}

/** Quita el sufijo de dispositivo ("521…:12@s.whatsapp.net" → "521…@s.whatsapp.net"). */
export function bareJid(jid: string): string {
  return jid.replace(/:\d+(?=@)/, "");
}

/** Número a mostrar a partir de un JID de teléfono; null para un @lid (no es un número). */
export function phoneOfJid(jid: string): string | null {
  return PERSONAL.test(jid) ? jid.split("@")[0] : null;
}

/**
 * El chat se identifica por el JID de TELÉFONO siempre que GoWA lo conozca: el
 * mismo contacto puede llegar como `…@lid` (id interno de WhatsApp) en un
 * mensaje y como número en el siguiente, y usar el que venga duplicaría la
 * conversación. GoWA ya normaliza `chat_id` al teléfono cuando lo sabe; si
 * aún es @lid se buscan las direcciones alternas del payload.
 */
export function chatKey(p: GowaPayload): string | null {
  const candidates = [p.chat_id, p.recipient_alt, p.sender_alt, !p.is_from_me ? p.from : null]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map(bareJid);
  const primary = candidates[0];
  if (!primary || !isDirectChat(primary)) return null;
  if (PERSONAL.test(primary)) return primary;
  return candidates.find((c) => PERSONAL.test(c)) ?? primary;
}

/** ¿`from` es el propio número del device? (`device_id` es su JID, con o sin sufijo de dispositivo). */
function isOwnJid(from: string | undefined, deviceJid: string | undefined): boolean {
  return !!from && !!deviceJid && bareJid(from) === bareJid(deviceJid);
}

// ── Eventos ─────────────────────────────────────────────────────────────

export interface GowaPayload {
  id?: string;
  ids?: string[];
  chat_id?: string;
  chat_lid?: string;
  from?: string;
  from_lid?: string;
  sender_alt?: string;
  recipient_alt?: string;
  from_name?: string;
  sender_display_name?: string;
  timestamp?: string;
  is_from_me?: boolean;
  body?: string;
  replied_to_id?: string;
  reaction?: string;
  reacted_message_id?: string;
  revoked_message_id?: string;
  receipt_type?: string;
  image?: unknown;
  video?: unknown;
  audio?: unknown;
  document?: unknown;
  sticker?: unknown;
  video_note?: unknown;
  ptt?: unknown;
  location?: { degreesLatitude?: number; degreesLongitude?: number; name?: string } | unknown;
  contact?: unknown;
  selection?: { selected_id?: string; text?: string };
  view_once?: boolean;
  // Eventos de device
  code?: number;
  reason?: string;
  expires_at?: string;
  is_active?: boolean;
  ends_at?: string;
}

export interface GowaEnvelope {
  event?: string;
  /** JID del número que recibió el evento ("521…@s.whatsapp.net"). */
  device_id?: string;
  /** Id del device (el que registramos con POST /devices = credentials.deviceId). Los eventos de device siempre lo traen; los demás pueden omitirlo. */
  session_id?: string;
  timestamp?: string;
  payload?: GowaPayload;
}

export interface NormalizedGowaMessage {
  externalId: string; // JID del chat (preferentemente el de teléfono)
  externalMessageId: string;
  fromMe: boolean;
  timestamp: Date;
  type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contacts" | "unsupported";
  body: string;
  caption: string | null;
  hasMedia: boolean;
  filename: string | null;
  mimeType: string | null;
  contactName: string;
  replyToExternalId: string | null;
  interactiveReplyId: string | null;
}

export type GowaEvent =
  | { kind: "message"; message: NormalizedGowaMessage }
  | { kind: "ack"; ids: string[]; status: "delivered" | "read" }
  | { kind: "reaction"; externalId: string; targetId: string; emoji: string | null }
  | { kind: "revoked"; externalId: string; targetId: string }
  | { kind: "logged_out"; reason: string }
  | { kind: "temporary_ban"; reason: string; until: Date | null }
  | { kind: "reachout_timelock"; active: boolean; until: Date | null }
  | { kind: "ignored"; why: string };

const MEDIA_KEYS = ["image", "video", "audio", "ptt", "document", "sticker", "video_note"] as const;
type MediaKey = (typeof MEDIA_KEYS)[number];
const TYPE_OF: Record<MediaKey, NormalizedGowaMessage["type"]> = {
  image: "image",
  video: "video",
  video_note: "video",
  audio: "audio",
  ptt: "audio",
  document: "document",
  sticker: "sticker",
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function parseDate(v: unknown, fallback: Date): Date {
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : fallback;
}

function mediaMeta(value: unknown): { caption: string | null; filename: string | null; mimeType: string | null } {
  if (!value || typeof value !== "object") return { caption: null, filename: null, mimeType: null };
  const o = value as Record<string, unknown>;
  return {
    caption: str(o.caption),
    filename: str(o.filename) ?? str(o.file_name),
    mimeType: str(o.mime_type) ?? str(o.mimetype),
  };
}

/** Convierte un POST de GoWA en algo que la ruta sabe persistir. Nunca lanza. */
export function parseGowaEvent(env: GowaEnvelope, now: Date = new Date()): GowaEvent {
  const p = env.payload ?? {};
  switch (env.event) {
    case "message":
      return parseMessage(p, now);
    case "message.ack": {
      const ids = (p.ids ?? []).filter((id): id is string => typeof id === "string");
      // Los acuses de lectura PROPIOS (abrir el chat en el teléfono u otro
      // dispositivo vinculado) traen from = nuestro JID e ids de mensajes
      // ENTRANTES: no son un "leído" de nuestros salientes. `read-self` es el
      // mismo acuse propio con los recibos de lectura apagados. Solo cuentan
      // los del contacto.
      if (p.is_from_me || p.receipt_type === "read-self" || isOwnJid(p.from, env.device_id)) {
        return { kind: "ignored", why: "acuse propio" };
      }
      const status = p.receipt_type === "read" ? "read" : p.receipt_type === "delivered" ? "delivered" : null;
      if (!status || ids.length === 0) return { kind: "ignored", why: `acuse ${p.receipt_type ?? "sin tipo"}` };
      return { kind: "ack", ids, status };
    }
    case "message.reaction": {
      const externalId = chatKey(p);
      const targetId = str(p.reacted_message_id);
      if (!externalId || !targetId || p.is_from_me) return { kind: "ignored", why: "reacción fuera de un chat 1:1" };
      return { kind: "reaction", externalId, targetId, emoji: str(p.reaction) };
    }
    case "message.revoked": {
      const externalId = chatKey(p);
      const targetId = str(p.revoked_message_id) ?? str(p.id);
      if (!externalId || !targetId) return { kind: "ignored", why: "borrado sin chat" };
      return { kind: "revoked", externalId, targetId };
    }
    case "device.logged_out":
      return { kind: "logged_out", reason: str(p.reason) ?? "WhatsApp cerró la sesión" };
    case "device.temporary_ban":
      return { kind: "temporary_ban", reason: str(p.reason) ?? "WhatsApp suspendió el número temporalmente", until: p.expires_at ? parseDate(p.expires_at, now) : null };
    case "device.reachout_timelock":
      return { kind: "reachout_timelock", active: p.is_active !== false, until: p.ends_at ? parseDate(p.ends_at, now) : null };
    default:
      return { kind: "ignored", why: `evento ${env.event ?? "desconocido"}` };
  }
}

function parseMessage(p: GowaPayload, now: Date): GowaEvent {
  const externalId = chatKey(p);
  if (!externalId) return { kind: "ignored", why: "no es un chat 1:1" };
  const externalMessageId = str(p.id);
  if (!externalMessageId) return { kind: "ignored", why: "mensaje sin id" };

  const mediaKey = MEDIA_KEYS.find((k) => p[k] !== undefined && p[k] !== null);
  const meta = mediaKey ? mediaMeta(p[mediaKey]) : { caption: null, filename: null, mimeType: null };
  const text = str(p.body);
  let type: NormalizedGowaMessage["type"] = mediaKey ? TYPE_OF[mediaKey] : "text";
  if (!mediaKey && p.location) type = "location";
  else if (!mediaKey && p.contact) type = "contacts";
  else if (!mediaKey && !text) type = "unsupported";

  const caption = mediaKey ? (meta.caption ?? text) : null;
  // Mismo criterio que los demás canales: el cuerpo nunca queda vacío; los
  // medios sin texto se guardan como `[tipo]` (lo reconoce el bot-worker).
  const body = mediaKey ? (caption ?? `[${type}]`) : (text ?? `[${type}]`);
  const phone = phoneOfJid(externalId);

  return {
    kind: "message",
    message: {
      externalId,
      externalMessageId,
      fromMe: !!p.is_from_me,
      timestamp: parseDate(p.timestamp, now),
      type,
      body,
      caption,
      hasMedia: !!mediaKey,
      filename: meta.filename,
      mimeType: meta.mimeType,
      contactName: str(p.from_name) ?? str(p.sender_display_name) ?? (phone ? `+${phone}` : externalId),
      replyToExternalId: str(p.replied_to_id),
      interactiveReplyId: str(p.selection?.selected_id),
    },
  };
}
