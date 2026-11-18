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

/** Alta en Meta con el payload ya armado (template-definition.ts). */
export async function submitMetaTemplate(account: AdminAccount, payload: object): Promise<{ id: string; status: string | null; category: string | null }> {
  if (!account.wabaId) throw new MetaAdminError("La cuenta no tiene WABA ID", 422, null);
  const res = await graph<{ id?: string; status?: string; category?: string }>(account, "POST", `${encodeURIComponent(account.wabaId)}/message_templates`, {
    body: payload,
    fallback: "Meta no creó la plantilla",
  });
  if (!res.id) throw new MetaAdminError("Meta no devolvió el id de la plantilla", 502, null);
  return { id: res.id, status: res.status ?? null, category: res.category ?? null };
}

/**
 * Edita una plantilla existente (POST /{template_id}). Meta deja editar una
 * aprobada 1 vez cada 24 h y 10 veces en 30 días; vuelve a revisión.
 */
export async function editMetaTemplate(account: AdminAccount, templateId: string, body: { components?: object[]; category?: string; parameter_format?: string }): Promise<void> {
  await graph(account, "POST", encodeURIComponent(templateId), { body, fallback: "Meta no editó la plantilla" });
}

// ── Componentes conversacionales ───────────────────────────────────────────
// Sugerencias de inicio (ice breakers) y comandos ("/") del número. El mensaje
// de bienvenida (enable_welcome_message) se activa con setMetaWelcomeMessage()
// desde lib/whatsapp/welcome.ts, que guarda también el texto en Colibly.

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

/** Activa o apaga en Meta el aviso `request_welcome` del número. */
export async function setMetaWelcomeMessage(account: AdminAccount, enabled: boolean): Promise<void> {
  await graph(account, "POST", `${requirePhone(account)}/conversational_automation`, {
    body: { enable_welcome_message: enabled },
    fallback: "Meta no cambió el mensaje de bienvenida",
  });
}

// ── Catálogo y comercio ────────────────────────────────────────────────────
// El catálogo se crea en Commerce Manager y se conecta a la WABA desde el
// Administrador de WhatsApp; aquí solo se lee cuál está conectado y se
// cambian los dos ajustes del número (carrito y catálogo visible).

export interface CatalogInfo {
  id: string;
  name: string | null;
}

export const SMB_CATALOG_MESSAGE =
  "Meta no deja leer el catálogo de los números conectados por coexistencia (app WhatsApp Business): se administra desde la app. Para mandar productos indica catalogId.";

/** Meta responde (#10) "...SMB business type" en las WABA de la app WhatsApp Business. Pura. */
export function isSmbRestriction(err: unknown): boolean {
  return err instanceof MetaAdminError && err.metaCode === 10 && /SMB/i.test(err.message);
}

export async function listWabaCatalogs(account: AdminAccount): Promise<CatalogInfo[]> {
  if (!account.wabaId) throw new MetaAdminError("La cuenta no tiene WABA ID", 422, null);
  try {
    const body = await graph<{ data?: Array<{ id?: string; name?: string }> }>(account, "GET", `${encodeURIComponent(account.wabaId)}/product_catalogs`, {
      query: { fields: "id,name" },
      fallback: "Meta no devolvió los catálogos",
    });
    return (body.data ?? []).filter((c) => c.id).map((c) => ({ id: c.id!, name: c.name ?? null }));
  } catch (err) {
    // Limitación de Meta, no un fallo: se avisa como error del integrador.
    if (isSmbRestriction(err)) throw new MetaAdminError(SMB_CATALOG_MESSAGE, 422, 10);
    throw err;
  }
}

export interface CommerceSettings {
  cartEnabled: boolean;
  catalogVisible: boolean;
}

/** Pura. Sin configuración, Meta deja ambos apagados. */
export function parseCommerceSettings(body: { data?: Array<{ is_cart_enabled?: boolean; is_catalog_visible?: boolean }> } | null): CommerceSettings {
  const s = body?.data?.[0] ?? {};
  return { cartEnabled: s.is_cart_enabled === true, catalogVisible: s.is_catalog_visible === true };
}

export async function getCommerceSettings(account: AdminAccount): Promise<CommerceSettings> {
  const body = await graph<{ data?: Array<{ is_cart_enabled?: boolean; is_catalog_visible?: boolean }> }>(account, "GET", `${requirePhone(account)}/whatsapp_commerce_settings`, {
    fallback: "Meta no devolvió los ajustes de comercio",
  });
  return parseCommerceSettings(body);
}

export async function updateCommerceSettings(account: AdminAccount, input: Partial<CommerceSettings>): Promise<void> {
  // Meta los recibe como parámetros de la URL, no en el cuerpo.
  await graph(account, "POST", `${requirePhone(account)}/whatsapp_commerce_settings`, {
    query: {
      is_cart_enabled: input.cartEnabled === undefined ? undefined : String(input.cartEnabled),
      is_catalog_visible: input.catalogVisible === undefined ? undefined : String(input.catalogVisible),
    },
    fallback: "Meta no cambió los ajustes de comercio",
  });
}

// Catálogo por omisión de la cuenta para los envíos de productos: el único
// conectado a la WABA. Caché corta en memoria (se consulta en cada envío).
const catalogCache = new Map<string, { at: number; catalogs: CatalogInfo[] }>();
const CATALOG_CACHE_MS = 5 * 60_000;

export async function resolveCatalogId(account: AdminAccount & { id: string }, given?: string | null): Promise<string> {
  if (given) return given;
  const cached = catalogCache.get(account.id);
  const catalogs = cached && Date.now() - cached.at < CATALOG_CACHE_MS ? cached.catalogs : await listWabaCatalogs(account);
  catalogCache.set(account.id, { at: Date.now(), catalogs });
  if (catalogs.length === 0) throw new MetaAdminError("La cuenta no tiene un catálogo conectado en el Administrador de WhatsApp", 422, null);
  if (catalogs.length > 1) throw new MetaAdminError("La cuenta tiene varios catálogos conectados: indica catalogId", 422, null);
  return catalogs[0].id;
}

// ── WhatsApp Flows ─────────────────────────────────────────────────────────
// Se diseñan y publican en el constructor de Flows del Administrador de
// WhatsApp; aquí se listan para mandarlos (POST /messages type flow).

export interface FlowInfo {
  id: string;
  name: string;
  status: string; // DRAFT, PUBLISHED, DEPRECATED, BLOCKED, THROTTLED
  categories: string[];
}

export async function listFlows(account: AdminAccount): Promise<FlowInfo[]> {
  if (!account.wabaId) throw new MetaAdminError("La cuenta no tiene WABA ID", 422, null);
  const body = await graph<{ data?: Array<{ id?: string; name?: string; status?: string; categories?: string[] }> }>(account, "GET", `${encodeURIComponent(account.wabaId)}/flows`, {
    query: { fields: "id,name,status,categories", limit: "100" },
    fallback: "Meta no devolvió los Flows",
  });
  return (body.data ?? []).filter((f) => f.id).map((f) => ({ id: f.id!, name: f.name ?? "", status: f.status ?? "UNKNOWN", categories: f.categories ?? [] }));
}

// Alta, edición y ciclo de vida de Flows por API (POST /accounts/{id}/flows…).
// Meta valida el JSON al subirlo: los errores vuelven en validationErrors y el
// Flow queda en DRAFT hasta que se publica sin errores.

export interface FlowValidationError {
  error: string | null;
  message: string | null;
  line: number | null;
  column: number | null;
}

export interface FlowDetail extends FlowInfo {
  validationErrors: FlowValidationError[];
  jsonVersion: string | null;
  dataApiVersion: string | null;
  endpointUri: string | null;
  previewUrl: string | null;
  previewExpiresAt: string | null;
}

type RawValidation = { error?: string; error_type?: string; message?: string; line_start?: number; column_start?: number };

export function parseFlowValidation(list: RawValidation[] | undefined): FlowValidationError[] {
  return (list ?? []).map((v) => ({ error: v.error ?? v.error_type ?? null, message: v.message ?? null, line: v.line_start ?? null, column: v.column_start ?? null }));
}

export function parseFlowDetail(raw: Record<string, unknown>): FlowDetail {
  const preview = raw.preview as { preview_url?: string; expires_at?: string } | undefined;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    status: String(raw.status ?? "UNKNOWN"),
    categories: Array.isArray(raw.categories) ? (raw.categories as string[]) : [],
    validationErrors: parseFlowValidation(raw.validation_errors as RawValidation[] | undefined),
    jsonVersion: (raw.json_version as string) ?? null,
    dataApiVersion: (raw.data_api_version as string) ?? null,
    endpointUri: (raw.endpoint_uri as string) ?? null,
    previewUrl: preview?.preview_url ?? null,
    previewExpiresAt: preview?.expires_at ?? null,
  };
}

const FLOW_FIELDS = "id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,preview.invalidate(false)";

/** El Flow, solo si es de la WABA de la cuenta (Meta no filtra por WABA en /{flow_id}). */
export async function getFlow(account: AdminAccount, flowId: string): Promise<FlowDetail> {
  const owned = (await listFlows(account)).some((f) => f.id === flowId);
  if (!owned) throw new MetaAdminError("Flow no encontrado en esta cuenta", 404, null);
  const raw = await graph<Record<string, unknown>>(account, "GET", encodeURIComponent(flowId), { query: { fields: FLOW_FIELDS }, fallback: "Meta no devolvió el Flow" });
  return parseFlowDetail(raw);
}

export interface FlowWrite {
  name?: string;
  categories?: string[];
  endpointUri?: string | null;
}

export async function createFlow(account: AdminAccount, input: FlowWrite & { name: string; categories: string[]; flowJson?: object; publish?: boolean; cloneFlowId?: string }): Promise<{ id: string; validationErrors: FlowValidationError[] }> {
  if (!account.wabaId) throw new MetaAdminError("La cuenta no tiene WABA ID", 422, null);
  const body: Record<string, unknown> = { name: input.name, categories: input.categories };
  if (input.flowJson) body.flow_json = JSON.stringify(input.flowJson);
  if (input.publish) body.publish = true;
  if (input.cloneFlowId) body.clone_flow_id = input.cloneFlowId;
  if (input.endpointUri) body.endpoint_uri = input.endpointUri;
  const res = await graph<{ id?: string; validation_errors?: RawValidation[] }>(account, "POST", `${encodeURIComponent(account.wabaId)}/flows`, { body, fallback: "Meta no creó el Flow" });
  if (!res.id) throw new MetaAdminError("Meta no devolvió el id del Flow", 502, null);
  return { id: res.id, validationErrors: parseFlowValidation(res.validation_errors) };
}

export async function updateFlowMetadata(account: AdminAccount, flowId: string, input: FlowWrite): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.categories !== undefined) body.categories = input.categories;
  if (input.endpointUri !== undefined) body.endpoint_uri = input.endpointUri ?? "";
  if (Object.keys(body).length === 0) return;
  await graph(account, "POST", encodeURIComponent(flowId), { body, fallback: "Meta no actualizó el Flow" });
}

/** Sube el JSON del Flow (asset FLOW_JSON). Multipart: no pasa por graph(). */
export async function uploadFlowJson(account: AdminAccount, flowId: string, flowJson: object): Promise<FlowValidationError[]> {
  if (!account.accessToken) throw new MetaAdminError("La cuenta no tiene token de acceso de Meta", 422, null);
  const form = new FormData();
  form.append("file", new Blob([JSON.stringify(flowJson)], { type: "application/json" }), "flow.json");
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");
  const res = await fetch(`${GRAPH_API_BASE}/${encodeURIComponent(flowId)}/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${decrypt(account.accessToken)}` },
    body: form,
    signal: httpTimeout(),
  });
  const body = (await res.json().catch(() => null)) as ({ validation_errors?: RawValidation[] } & MetaErrorBody) | null;
  if (!res.ok) throw new MetaAdminError(metaMessage(body, "Meta no aceptó el JSON del Flow"), res.status, body?.error?.code ?? null);
  return parseFlowValidation(body?.validation_errors);
}

export async function flowAction(account: AdminAccount, flowId: string, action: "publish" | "deprecate"): Promise<void> {
  await graph(account, "POST", `${encodeURIComponent(flowId)}/${action}`, { body: {}, fallback: action === "publish" ? "Meta no publicó el Flow" : "Meta no retiró el Flow" });
}

/** Solo se borran Flows en DRAFT (los publicados se retiran con deprecate). */
export async function deleteFlow(account: AdminAccount, flowId: string): Promise<void> {
  await graph(account, "DELETE", encodeURIComponent(flowId), { fallback: "Meta no borró el Flow" });
}

// ── Números de la WABA, PIN y registro ─────────────────────────────────────
// Lo que antes solo se hacía en el Administrador de WhatsApp: ver todos los
// números de la cuenta de Meta (estén o no en Colibly), cambiar el PIN de la
// verificación en dos pasos y registrar o dar de baja el número en Cloud API.

export interface WabaNumber {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  nameStatus: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  status: string | null;
  platformType: string | null;
  codeVerificationStatus: string | null;
  isOnBizApp: boolean;
  isOfficialBusinessAccount: boolean;
  throughput: string | null;
}

type RawNumber = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  name_status?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  status?: string;
  platform_type?: string;
  code_verification_status?: string;
  is_on_biz_app?: boolean;
  is_official_business_account?: boolean;
  throughput?: { level?: string };
};

export function parseWabaNumber(n: RawNumber): WabaNumber {
  return {
    phoneNumberId: n.id ?? "",
    displayPhoneNumber: n.display_phone_number ?? null,
    verifiedName: n.verified_name ?? null,
    nameStatus: n.name_status ?? null,
    qualityRating: n.quality_rating ?? null,
    messagingLimitTier: n.messaging_limit_tier ?? null,
    status: n.status ?? null,
    platformType: n.platform_type ?? null,
    codeVerificationStatus: n.code_verification_status ?? null,
    isOnBizApp: n.is_on_biz_app === true,
    isOfficialBusinessAccount: n.is_official_business_account === true,
    throughput: n.throughput?.level ?? null,
  };
}

const NUMBER_FIELDS = "id,display_phone_number,verified_name,name_status,quality_rating,messaging_limit_tier,status,platform_type,code_verification_status,is_on_biz_app,is_official_business_account,throughput";

export async function listWabaNumbers(account: AdminAccount): Promise<WabaNumber[]> {
  if (!account.wabaId) throw new MetaAdminError("La cuenta no tiene WABA ID", 422, null);
  const body = await graph<{ data?: RawNumber[] }>(account, "GET", `${encodeURIComponent(account.wabaId)}/phone_numbers`, {
    query: { fields: NUMBER_FIELDS, limit: "100" },
    fallback: "Meta no devolvió los números de la cuenta",
  });
  return (body.data ?? []).filter((n) => n.id).map(parseWabaNumber);
}

/** Cambia el PIN de 6 dígitos de la verificación en dos pasos del número. */
export async function setTwoStepPin(account: AdminAccount, pin: string): Promise<void> {
  await graph(account, "POST", encodeURIComponent(requirePhone(account)), { body: { pin }, fallback: "Meta no cambió el PIN" });
}

/** Registra el número en Cloud API (con el PIN vigente; si no tenía, lo fija). */
export async function registerNumber(account: AdminAccount, pin: string): Promise<void> {
  await graph(account, "POST", `${encodeURIComponent(requirePhone(account))}/register`, {
    body: { messaging_product: "whatsapp", pin },
    fallback: "Meta no registró el número",
  });
}

/** Da de baja el número de Cloud API: deja de enviar y recibir hasta registrarlo otra vez. */
export async function deregisterNumber(account: AdminAccount): Promise<void> {
  await graph(account, "POST", `${encodeURIComponent(requirePhone(account))}/deregister`, { body: {}, fallback: "Meta no dio de baja el número" });
}
