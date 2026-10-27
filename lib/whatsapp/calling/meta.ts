import type { WAAccount } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { assertOrgCanSend } from "@/lib/billing/gates";
import { graphUrl } from "@/lib/meta/graph";
import { httpTimeout } from "@/lib/http-timeouts";

export class CallingError extends Error {
  constructor(message: string, readonly status: number, readonly metaCode?: number) {
    super(message);
    this.name = "CallingError";
  }
}

const PERMISSION_CODE = 138006;

export function isCallPermissionError(error: unknown): boolean {
  return error instanceof CallingError && (error.metaCode === PERMISSION_CODE || /permission/i.test(error.message));
}

function accessToken(account: WAAccount): string {
  if (!account.phoneNumberId || !account.accessToken) {
    throw new CallingError("Esta cuenta no tiene credenciales de WhatsApp", 400);
  }
  return decrypt(account.accessToken);
}

async function graph<T>(account: WAAccount, path: string, init: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}): Promise<T> {
  const res = await fetch(graphUrl(path), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken(account)}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: httpTimeout(),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!res.ok) {
    throw new CallingError(json.error?.message ?? `WhatsApp respondió HTTP ${res.status}`, res.status, json.error?.code);
  }
  return json;
}

export function assertCallsOnCloudApi(account: WAAccount): void {
  if (account.coexistence) {
    throw new CallingError("En un número de Coexistencia las llamadas se contestan en el celular, no en Colibly.", 409);
  }
}

// Enciende o apaga el botón de llamada del número. No activa SIP: con SIP
// Meta deja de mandar los webhooks que esta bandeja necesita.
export async function setCallingEnabled(account: WAAccount, enabled: boolean): Promise<void> {
  assertCallsOnCloudApi(account);
  await assertOrgCanSend(account.organizationId);
  await graph(account, `${account.phoneNumberId}/settings`, {
    method: "POST",
    body: {
      calling: enabled
        ? { status: "ENABLED", call_icon_visibility: "DEFAULT", callback_permission_status: "ENABLED" }
        : { status: "DISABLED" },
    },
  });
}

// Meta lee el propósito en voz alta y, con las dos opciones, usa el de la
// grabación para un solo aviso. El texto va en el idioma del aviso.
export function callCaptureFields(): { recording: Record<string, string>; transcription: Record<string, string> } {
  const capture = { status: "ENABLED", purpose: "seguimiento de esta conversación", announcement_language: "es" };
  return { recording: capture, transcription: { ...capture } };
}

export async function signalCall(account: WAAccount, body: Record<string, unknown>): Promise<void> {
  assertCallsOnCloudApi(account);
  await assertOrgCanSend(account.organizationId);
  await graph(account, `${account.phoneNumberId}/calls`, {
    method: "POST",
    body: { messaging_product: "whatsapp", ...body },
  });
}

export async function connectCall(account: WAAccount, to: string, sdp: string, opaque: string): Promise<string> {
  assertCallsOnCloudApi(account);
  await assertOrgCanSend(account.organizationId);
  const json = await graph<{ calls?: Array<{ id?: string }> }>(account, `${account.phoneNumberId}/calls`, {
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      to,
      action: "connect",
      session: { sdp_type: "offer", sdp },
      biz_opaque_callback_data: opaque.slice(0, 512),
      ...callCaptureFields(),
    },
  });
  const id = json.calls?.[0]?.id;
  if (!id) throw new CallingError("WhatsApp no devolvió el id de la llamada", 502);
  return id;
}

export interface CallPermission {
  canStart: boolean;
  canRequest: boolean;
}

export async function getCallPermission(account: WAAccount, userWaId: string): Promise<CallPermission> {
  assertCallsOnCloudApi(account);
  const json = await graph<{ actions?: Array<{ action_name?: string; can_perform_action?: boolean }> }>(
    account,
    `${account.phoneNumberId}/call_permissions?user_wa_id=${encodeURIComponent(userWaId)}`,
  );
  const actions = json.actions ?? [];
  const allows = (name: string) => actions.find((action) => action.action_name === name)?.can_perform_action === true;
  return { canStart: allows("start_call"), canRequest: allows("send_call_permission_request") };
}

export async function sendCallPermissionRequest(account: WAAccount, to: string): Promise<string | null> {
  assertCallsOnCloudApi(account);
  await assertOrgCanSend(account.organizationId);
  const json = await graph<{ messages?: Array<{ id?: string }> }>(account, `${account.phoneNumberId}/messages`, {
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "call_permission_request",
        action: { name: "call_permission_request" },
        body: { text: "¿Podemos llamarte para seguir esta conversación?" },
      },
    },
  });
  return json.messages?.[0]?.id ?? null;
}
