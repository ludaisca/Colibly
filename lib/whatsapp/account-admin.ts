import { decrypt } from "@/lib/crypto";
import { GRAPH_API_BASE } from "@/lib/meta/graph";
import { httpTimeout } from "@/lib/http-timeouts";

// Administración de la cuenta de WhatsApp en Meta (lo que la API pública
// expone en /api/v1/accounts/{id}/… y DELETE /templates/{id}): perfil de
// empresa, usuarios bloqueados y borrado de plantillas. Funciones puras para
// armar/leer los payloads (probadas en __tests__/account-admin.test.ts) y
// llamadas a Graph que lanzan MetaAdminError con el texto de Meta.

export class MetaAdminError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly metaCode: number | null
  ) {
    super(message);
    this.name = "MetaAdminError";
  }
}

export interface AdminAccount {
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: string | null;
}

interface MetaErrorBody {
  error?: { message?: string; error_user_msg?: string; error_user_title?: string; code?: number; error_data?: { details?: string } };
}

function metaMessage(body: MetaErrorBody | null, fallback: string): string {
  const e = body?.error;
  return (e?.error_user_msg || e?.error_data?.details || e?.message || fallback).slice(0, 500);
}

async function graph<T>(
  account: AdminAccount,
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts: { query?: Record<string, string | undefined>; body?: unknown; fallback: string; acceptErrorBody?: (body: T) => boolean }
): Promise<T> {
  if (!account.accessToken) throw new MetaAdminError("La cuenta no tiene token de acceso de Meta", 422, null);
  const url = new URL(`${GRAPH_API_BASE}/${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${decrypt(account.accessToken)}`,
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    signal: httpTimeout(),
  });
  const body = (await res.json().catch(() => null)) as (T & MetaErrorBody) | null;
  if (!res.ok) {
    // El bloqueo masivo responde 400 con los que sí se aplicaron y los que no.
    if (body && opts.acceptErrorBody?.(body)) return body;
    throw new MetaAdminError(metaMessage(body, opts.fallback), res.status, body?.error?.code ?? null);
  }
  return (body ?? {}) as T;
}

function requirePhone(account: AdminAccount): string {
  if (!account.phoneNumberId) throw new MetaAdminError("La cuenta no tiene Phone Number ID de Meta", 422, null);
  return account.phoneNumberId;
}

// ── Perfil de empresa ──────────────────────────────────────────────────────

export const PROFILE_FIELDS = "about,address,description,email,profile_picture_url,websites,vertical";

export interface BusinessProfile {
  about: string | null;
  address: string | null;
  description: string | null;
  email: string | null;
  websites: string[];
  vertical: string | null;
  profilePictureUrl: string | null;
}

export interface BusinessProfileUpdate {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  /** Handle de la Resumable Upload API (lib/whatsapp/resumable-upload.ts). */
  profilePictureHandle?: string;
}

interface MetaProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  profile_picture_url?: string;
}

/** `{ data: [ {...} ] }` de Meta → forma pública. Pura. */
export function parseBusinessProfile(body: { data?: MetaProfile[] } | null): BusinessProfile {
  const p = body?.data?.[0] ?? {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    about: str(p.about),
    address: str(p.address),
    description: str(p.description),
    email: str(p.email),
    websites: Array.isArray(p.websites) ? p.websites.filter((w): w is string => typeof w === "string" && !!w) : [],
    vertical: str(p.vertical),
    profilePictureUrl: str(p.profile_picture_url),
  };
}

/** Forma pública → cuerpo de POST /whatsapp_business_profile. Solo los campos dados. Pura. */
export function buildBusinessProfilePayload(input: BusinessProfileUpdate): Record<string, unknown> {
  const payload: Record<string, unknown> = { messaging_product: "whatsapp" };
  if (input.about !== undefined) payload.about = input.about;
  if (input.address !== undefined) payload.address = input.address;
  if (input.description !== undefined) payload.description = input.description;
  if (input.email !== undefined) payload.email = input.email;
  if (input.websites !== undefined) payload.websites = input.websites;
  if (input.vertical !== undefined) payload.vertical = input.vertical;
  if (input.profilePictureHandle !== undefined) payload.profile_picture_handle = input.profilePictureHandle;
  return payload;
}

export async function getBusinessProfile(account: AdminAccount): Promise<BusinessProfile> {
  const body = await graph<{ data?: MetaProfile[] }>(account, "GET", `${requirePhone(account)}/whatsapp_business_profile`, {
    query: { fields: PROFILE_FIELDS },
    fallback: "Meta no devolvió el perfil de empresa",
  });
  return parseBusinessProfile(body);
}

export async function updateBusinessProfile(account: AdminAccount, input: BusinessProfileUpdate): Promise<void> {
  await graph(account, "POST", `${requirePhone(account)}/whatsapp_business_profile`, {
    body: buildBusinessProfilePayload(input),
    fallback: "Meta no aceptó el cambio de perfil",
  });
}

// ── Usuarios bloqueados ────────────────────────────────────────────────────
// Regla de Meta: solo se puede bloquear a quien escribió al número en las
// últimas 24 h; un bloqueado no puede escribir ni recibir mensajes del número.

export interface BlockResult {
  /** Teléfonos aplicados: lo que se mandó y el wa_id que devolvió Meta. */
  done: Array<{ input: string; waId: string | null }>;
  failed: Array<{ input: string; error: string }>;
}

interface MetaBlockUser {
  input?: string;
  wa_id?: string;
  errors?: Array<{ message?: string; error_data?: { details?: string } }>;
}

interface MetaBlockBody {
  block_users?: { added_users?: MetaBlockUser[]; removed_users?: MetaBlockUser[]; failed_users?: MetaBlockUser[] };
}

export function buildBlockPayload(phones: string[]): Record<string, unknown> {
  return { messaging_product: "whatsapp", block_users: phones.map((user) => ({ user })) };
}

/** Respuesta de POST/DELETE /block_users → aplicados y fallidos. Pura. */
export function parseBlockResponse(body: MetaBlockBody | null, kind: "added_users" | "removed_users", requested: string[], fallbackError: string | null = null): BlockResult {
  const done = (body?.block_users?.[kind] ?? []).map((u) => ({ input: u.input ?? u.wa_id ?? "", waId: u.wa_id ?? null }));
  const failed = (body?.block_users?.failed_users ?? []).map((u) => ({
    input: u.input ?? u.wa_id ?? "",
    error: (u.errors?.[0]?.error_data?.details || u.errors?.[0]?.message || fallbackError || "Meta no lo aplicó").slice(0, 300),
  }));
  // Meta a veces confirma solo con `success` o sin lista: lo que no aparece en
  // ningún lado se reporta como fallido para no dar por hecho lo que no se sabe.
  const seen = new Set([...done, ...failed].map((u) => u.input.replace(/\D/g, "")));
  for (const phone of requested) {
    if (!seen.has(phone.replace(/\D/g, ""))) failed.push({ input: phone, error: fallbackError ?? "Meta no confirmó el cambio" });
  }
  return { done, failed };
}

function hasBlockList(body: MetaBlockBody & MetaErrorBody): boolean {
  return !!body.block_users;
}

export async function blockUsers(account: AdminAccount, phones: string[]): Promise<BlockResult> {
  const body = await graph<MetaBlockBody & MetaErrorBody>(account, "POST", `${requirePhone(account)}/block_users`, {
    body: buildBlockPayload(phones),
    fallback: "Meta no aceptó el bloqueo",
    acceptErrorBody: hasBlockList,
  });
  return parseBlockResponse(body, "added_users", phones, body.error ? metaMessage(body, "") || null : null);
}

export async function unblockUsers(account: AdminAccount, phones: string[]): Promise<BlockResult> {
  const body = await graph<MetaBlockBody & MetaErrorBody>(account, "DELETE", `${requirePhone(account)}/block_users`, {
    body: buildBlockPayload(phones),
    fallback: "Meta no aceptó el desbloqueo",
    acceptErrorBody: hasBlockList,
  });
  return parseBlockResponse(body, "removed_users", phones, body.error ? metaMessage(body, "") || null : null);
}

interface MetaBlockedList {
  data?: Array<{ wa_id?: string; block_users?: Array<{ wa_id?: string }> }>;
  paging?: { cursors?: { after?: string }; next?: string };
}

/** Lista de GET /block_users (Meta la anida en `data[].block_users[]`). Pura. */
export function parseBlockedList(body: MetaBlockedList | null): { waIds: string[]; nextCursor: string | null } {
  const waIds: string[] = [];
  for (const entry of body?.data ?? []) {
    if (entry.wa_id) waIds.push(entry.wa_id);
    for (const u of entry.block_users ?? []) if (u.wa_id) waIds.push(u.wa_id);
  }
  // Sin `next` no hay más páginas aunque venga un cursor.
  const nextCursor = body?.paging?.next ? body.paging.cursors?.after ?? null : null;
  return { waIds, nextCursor };
}

export async function listBlockedUsers(account: AdminAccount, opts: { limit: number; cursor: string | null }) {
  const body = await graph<MetaBlockedList>(account, "GET", `${requirePhone(account)}/block_users`, {
    query: { limit: String(opts.limit), after: opts.cursor ?? undefined },
    fallback: "Meta no devolvió la lista de bloqueados",
  });
  return parseBlockedList(body);
}

// ── Plantillas ─────────────────────────────────────────────────────────────

/**
 * Borra una plantilla en un idioma (con `hsm_id` Meta borra solo esa versión;
 * sin él borraría todos los idiomas del nombre). Meta no deja reusar el nombre
 * durante 30 días.
 */
export async function deleteMetaTemplate(account: AdminAccount, template: { name: string; templateId: string }): Promise<void> {
  if (!account.wabaId) throw new MetaAdminError("La cuenta no tiene WABA ID", 422, null);
  await graph(account, "DELETE", `${encodeURIComponent(account.wabaId)}/message_templates`, {
    query: { name: template.name, hsm_id: template.templateId },
    fallback: "Meta no borró la plantilla",
  });
}

// ── Componentes conversacionales ───────────────────────────────────────────
// Sugerencias de inicio (ice breakers) y comandos ("/") del número. El mensaje
// de bienvenida (enable_welcome_message) solo se lee: al activarlo, Meta manda
// un mensaje `request_welcome` que la ingesta de Colibly todavía no interpreta.

export interface ConversationalAutomation {
  welcomeMessageEnabled: boolean;
  prompts: string[];
  commands: Array<{ name: string; description: string }>;
}

interface MetaConversationalAutomation {
  conversational_automation?: {
    enable_welcome_message?: boolean;
    prompts?: string[];
    commands?: Array<{ command_name?: string; command_description?: string }>;
  };
}

/** Pura. */
export function parseConversationalAutomation(body: MetaConversationalAutomation | null): ConversationalAutomation {
  const ca = body?.conversational_automation ?? {};
  return {
    welcomeMessageEnabled: ca.enable_welcome_message === true,
    prompts: (ca.prompts ?? []).filter((p): p is string => typeof p === "string" && !!p),
    commands: (ca.commands ?? [])
      .filter((c) => c.command_name)
      .map((c) => ({ name: c.command_name!, description: c.command_description ?? "" })),
  };
}

/** Solo los campos dados; `[]` borra la lista. Pura. */
export function buildConversationalAutomationPayload(input: { prompts?: string[]; commands?: Array<{ name: string; description: string }> }): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.prompts !== undefined) payload.prompts = input.prompts;
  if (input.commands !== undefined) payload.commands = input.commands.map((c) => ({ command_name: c.name, command_description: c.description }));
  return payload;
}

export async function getConversationalAutomation(account: AdminAccount): Promise<ConversationalAutomation> {
  const body = await graph<MetaConversationalAutomation>(account, "GET", requirePhone(account), {
    query: { fields: "conversational_automation" },
    fallback: "Meta no devolvió las sugerencias y comandos",
  });
  return parseConversationalAutomation(body);
}

export async function updateConversationalAutomation(account: AdminAccount, input: { prompts?: string[]; commands?: Array<{ name: string; description: string }> }): Promise<void> {
  await graph(account, "POST", `${requirePhone(account)}/conversational_automation`, {
    body: buildConversationalAutomationPayload(input),
    fallback: "Meta no aceptó las sugerencias y comandos",
  });
}

// ── Códigos QR con mensaje prellenado ──────────────────────────────────────

export interface QrCode {
  code: string;
  prefilledMessage: string;
  deepLinkUrl: string | null;
  qrImageUrl: string | null;
}

interface MetaQr {
  code?: string;
  prefilled_message?: string;
  deep_link_url?: string;
  qr_image_url?: string;
}

/** Pura. */
export function parseQr(q: MetaQr): QrCode {
  return { code: q.code ?? "", prefilledMessage: q.prefilled_message ?? "", deepLinkUrl: q.deep_link_url ?? null, qrImageUrl: q.qr_image_url ?? null };
}

export async function listQrCodes(account: AdminAccount): Promise<QrCode[]> {
  const body = await graph<{ data?: MetaQr[] }>(account, "GET", `${requirePhone(account)}/message_qrdls`, {
    query: { fields: "code,prefilled_message,deep_link_url,qr_image_url.format(PNG)" },
    fallback: "Meta no devolvió los códigos QR",
  });
  return (body.data ?? []).map(parseQr).filter((q) => q.code);
}

/** Crea (sin `code`) o cambia el mensaje de un QR existente (con `code`). */
export async function saveQrCode(account: AdminAccount, input: { code?: string; prefilledMessage: string; format?: "PNG" | "SVG" }): Promise<QrCode> {
  const body = await graph<MetaQr>(account, "POST", `${requirePhone(account)}/message_qrdls`, {
    body: {
      prefilled_message: input.prefilledMessage,
      ...(input.code ? { code: input.code } : { generate_qr_image: input.format ?? "PNG" }),
    },
    fallback: input.code ? "Meta no actualizó el código QR" : "Meta no creó el código QR",
  });
  return parseQr(body);
}

export async function deleteQrCode(account: AdminAccount, code: string): Promise<void> {
  await graph(account, "DELETE", `${requirePhone(account)}/message_qrdls/${encodeURIComponent(code)}`, {
    fallback: "Meta no borró el código QR",
  });
}

// ── Costos (pricing_analytics de la WABA, modelo por mensaje) ─────────────

export interface PricingPoint {
  start: string;
  end: string;
  phone: string | null;
  country: string | null;
  category: string | null; // MARKETING, UTILITY, AUTHENTICATION, SERVICE…
  pricingType: string | null; // REGULAR, FREE_CUSTOMER_SERVICE, FREE_ENTRY_POINT…
  volume: number;
  cost: number;
}

interface MetaPricingPoint {
  start?: number;
  end?: number;
  phone_number?: string;
  country?: string;
  pricing_category?: string;
  pricing_type?: string;
  volume?: number;
  cost?: number;
}

interface MetaPricingContainer {
  data?: Array<{ data_points?: MetaPricingPoint[] }>;
  paging?: { next?: string };
}

const MAX_ANALYTICS_PAGES = 20;

/** Puntos de Meta → forma pública; solo los del número de la cuenta. Pura. */
export function parsePricingPoints(points: MetaPricingPoint[], phoneDigits: string | null): PricingPoint[] {
  const same = (p?: string) => {
    if (!phoneDigits || !p) return true;
    const d = p.replace(/\D/g, "");
    // México: 52… y 521… son el mismo número.
    const norm = (x: string) => (/^521\d{10}$/.test(x) ? `52${x.slice(3)}` : x);
    return norm(d) === norm(phoneDigits);
  };
  return points
    .filter((p) => same(p.phone_number))
    .map((p) => ({
      start: new Date((p.start ?? 0) * 1000).toISOString(),
      end: new Date((p.end ?? 0) * 1000).toISOString(),
      phone: p.phone_number ?? null,
      country: p.country ?? null,
      category: p.pricing_category ?? null,
      pricingType: p.pricing_type ?? null,
      volume: p.volume ?? 0,
      cost: p.cost ?? 0,
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function getPricingAnalytics(
  account: AdminAccount & { phoneNumber: string | null },
  opts: { start: Date; end: Date; granularity: "DAILY" | "MONTHLY" }
): Promise<PricingPoint[]> {
  if (!account.wabaId) throw new MetaAdminError("La cuenta no tiene WABA ID", 422, null);
  const fields =
    `pricing_analytics.start(${Math.floor(opts.start.getTime() / 1000)}).end(${Math.floor(opts.end.getTime() / 1000)})` +
    `.granularity(${opts.granularity}).dimensions(["PHONE","COUNTRY","PRICING_CATEGORY","PRICING_TYPE"])`;
  // La primera página es una expansión de campo de la WABA (anidada en
  // pricing_analytics); las siguientes (paging.next) vienen sin ese envoltorio.
  const first = await graph<{ pricing_analytics?: MetaPricingContainer }>(account, "GET", encodeURIComponent(account.wabaId), {
    query: { fields },
    fallback: "Meta no devolvió los costos",
  });
  const points: MetaPricingPoint[] = [];
  let container: MetaPricingContainer | undefined = first.pricing_analytics;
  for (let page = 0; container && page < MAX_ANALYTICS_PAGES; page++) {
    for (const d of container.data ?? []) points.push(...(d.data_points ?? []));
    const next: string | undefined = container.paging?.next;
    if (!next) break;
    const res = await fetch(next, { headers: { Authorization: `Bearer ${decrypt(account.accessToken!)}` }, signal: httpTimeout() });
    const body = (await res.json().catch(() => null)) as (MetaPricingContainer & MetaErrorBody) | null;
    if (!res.ok) throw new MetaAdminError(metaMessage(body, "Meta no devolvió los costos"), res.status, body?.error?.code ?? null);
    container = body ?? undefined;
  }
  const digits = account.phoneNumber ? account.phoneNumber.replace(/\D/g, "") : null;
  return parsePricingPoints(points, digits);
}
