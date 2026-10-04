import { graphUrl } from "@/lib/meta/graph";
import { httpTimeout } from "@/lib/http-timeouts";

// Llamadas del servidor a la Graph API para dar de alta a un cliente con
// Embedded Signup (Tech Provider) y pedir la sincronización de coexistencia.
// Endpoints y parámetros verificados en la documentación de Meta (2026-10-03).

export class MetaGraphError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: number, public readonly subcode?: number) {
    super(message);
    this.name = "MetaGraphError";
  }
}

async function call<T>(url: string, init: { method?: "GET" | "POST"; token?: string; body?: Record<string, unknown> } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: httpTimeout(),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } } & T;
  if (!res.ok) {
    throw new MetaGraphError(json.error?.message ?? `Meta respondió HTTP ${res.status}`, res.status, json.error?.code, json.error?.error_subcode);
  }
  return json;
}

export interface BusinessToken {
  accessToken: string;
  // Segundos de vida si Meta los informa; la documentación no los garantiza.
  expiresIn: number | null;
}

// Cambia el `code` que devuelve el diálogo de Embedded Signup por el token de
// negocio del cliente.
export async function exchangeCodeForToken(params: { appId: string; appSecret: string; code: string }): Promise<BusinessToken> {
  const json = await call<{ access_token?: string; expires_in?: number }>(
    graphUrl("oauth/access_token", { client_id: params.appId, client_secret: params.appSecret, code: params.code })
  );
  if (!json.access_token) throw new MetaGraphError("Meta no devolvió un token de acceso", 502);
  return { accessToken: json.access_token, expiresIn: typeof json.expires_in === "number" ? json.expires_in : null };
}

// Suscribe la app de plataforma a los webhooks de la WABA del cliente.
export async function subscribeAppToWaba(wabaId: string, token: string): Promise<void> {
  await call<{ success?: boolean }>(graphUrl(`${wabaId}/subscribed_apps`), { method: "POST", token });
}

export interface WabaPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  platform_type?: string;
  is_on_biz_app?: boolean;
}

// Números de la WABA a los que el token tiene acceso: confirma que el
// phone_number_id que mandó el navegador de verdad pertenece a esa WABA.
export async function listWabaPhoneNumbers(wabaId: string, token: string): Promise<WabaPhoneNumber[]> {
  const json = await call<{ data?: WabaPhoneNumber[] }>(
    graphUrl(`${wabaId}/phone_numbers`, { fields: "id,display_phone_number,verified_name,quality_rating,platform_type,is_on_biz_app" }),
    { token }
  );
  return json.data ?? [];
}

// Registra el número en Cloud API con un PIN de 6 dígitos. Se OMITE en
// coexistencia (el número ya está registrado por la app WhatsApp Business).
export async function registerPhoneNumber(phoneNumberId: string, token: string, pin: string): Promise<void> {
  await call<{ success?: boolean }>(graphUrl(`${phoneNumberId}/register`), {
    method: "POST",
    token,
    body: { messaging_product: "whatsapp", pin },
  });
}

export type SmbSyncType = "smb_app_state_sync" | "history";

// Pide a Meta la sincronización de contactos (smb_app_state_sync) o del
// historial (history). Cada una solo puede pedirse UNA vez por conexión.
export async function requestSmbAppData(phoneNumberId: string, token: string, syncType: SmbSyncType): Promise<string | null> {
  const json = await call<{ request_id?: string }>(graphUrl(`${phoneNumberId}/smb_app_data`), {
    method: "POST",
    token,
    body: { messaging_product: "whatsapp", sync_type: syncType },
  });
  return json.request_id ?? null;
}

// Id de Meta de quien autorizó la app, para casar los callbacks de
// desautorización/eliminación de datos. Mejor esfuerzo: si falla, null.
export async function lookupTokenUserId(params: { appId: string; appSecret: string; token: string }): Promise<string | null> {
  try {
    const json = await call<{ data?: { user_id?: string } }>(
      graphUrl("debug_token", { input_token: params.token, access_token: `${params.appId}|${params.appSecret}` })
    );
    return json.data?.user_id ?? null;
  } catch {
    return null;
  }
}
