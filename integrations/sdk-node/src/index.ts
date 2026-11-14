import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Cliente de la API pública de Colibly (/api/v1). Sin dependencias: usa el
// fetch de Node 18+. La referencia completa de cada endpoint está en
// https://app.colibly.com/docs/api y en /api/v1/openapi.json.

export interface ColiblyOptions {
  /** sk_live_… o sk_test_… (las de prueba simulan los envíos). */
  apiKey: string;
  /** Por omisión https://app.colibly.com */
  baseUrl?: string;
  /** Reintentos ante 429, 503 y errores de red (con Retry-After). Por omisión 2. */
  maxRetries?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: { path: string; message: string }[];
  meta?: { code: number };
  requestId?: string;
}

/** Error de la API: `code` para ramificar, `message` en español, `metaCode` si WhatsApp lo rechazó. */
export class ColiblyError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: { path: string; message: string }[];
  readonly metaCode: number | null;
  readonly requestId: string | null;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ColiblyError";
    this.status = status;
    this.code = body.code;
    this.details = body.details ?? [];
    this.metaCode = body.meta?.code ?? null;
    this.requestId = body.requestId ?? null;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;
type Json = Record<string, unknown>;

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

const RETRYABLE = new Set([429, 503]);

export class Colibly {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ColiblyOptions) {
    if (!opts?.apiKey) throw new Error("Falta apiKey");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://app.colibly.com").replace(/\/$/, "");
    this.maxRetries = opts.maxRetries ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  /** Llamada genérica a /api/v1{path}: para cualquier endpoint que no tenga atajo aquí. */
  async request<T = Json>(method: string, path: string, opts: { body?: unknown; query?: Query; idempotencyKey?: string } = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    // Los POST llevan Idempotency-Key: un reintento no duplica el envío.
    const idempotencyKey = opts.idempotencyKey ?? (method === "POST" ? randomUUID() : undefined);
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (attempt < this.maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw err;
      }
      if (RETRYABLE.has(res.status) && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
        continue;
      }
      const text = await res.text();
      const parsed = text ? (JSON.parse(text) as unknown) : {};
      if (!res.ok) {
        const body = (parsed as { error?: ApiErrorBody }).error ?? { code: "http_error", message: `HTTP ${res.status}` };
        throw new ColiblyError(res.status, body);
      }
      return parsed as T;
    }
  }

  /** Recorre todas las páginas de un listado con cursor. */
  async *paginate<T = Json>(path: string, query: Query = {}): AsyncGenerator<T> {
    let cursor: string | null = null;
    do {
      const page: Page<T> = await this.request<Page<T>>("GET", path, { query: { ...query, limit: query.limit ?? 100, cursor } });
      for (const row of page.data) yield row;
      cursor = page.nextCursor;
    } while (cursor);
  }

  readonly me = () => this.request("GET", "/me");

  readonly contacts = {
    list: (query?: Query) => this.request<Page<Json>>("GET", "/contacts", { query }),
    get: (id: string) => this.request("GET", `/contacts/${enc(id)}`),
    create: (body: Json) => this.request("POST", "/contacts", { body }),
    update: (id: string, body: Json) => this.request("PATCH", `/contacts/${enc(id)}`, { body }),
    addTag: (id: string, tag: { tagId: string } | { name: string }) => this.request("POST", `/contacts/${enc(id)}/tags`, { body: tag }),
  };

  readonly conversations = {
    list: (query?: Query) => this.request<Page<Json>>("GET", "/conversations", { query }),
    get: (id: string) => this.request("GET", `/conversations/${enc(id)}`),
    update: (id: string, body: Json) => this.request("PATCH", `/conversations/${enc(id)}`, { body }),
    messages: (id: string, query?: Query) => this.request<Page<Json>>("GET", `/conversations/${enc(id)}/messages`, { query }),
  };

  readonly messages = {
    /** POST /messages. Con una key sk_test_ responde la vista previa sin enviar. */
    send: (body: Json, opts: { idempotencyKey?: string } = {}) => this.request("POST", "/messages", { body, idempotencyKey: opts.idempotencyKey }),
    get: (id: string) => this.request("GET", `/messages/${enc(id)}`),
    react: (id: string, emoji: string) => this.request("POST", `/messages/${enc(id)}/reaction`, { body: { emoji } }),
  };

  readonly templates = {
    list: (query?: Query) => this.request<{ data: Json[] }>("GET", "/templates", { query }),
    get: (id: string) => this.request("GET", `/templates/${enc(id)}`),
    create: (body: Json) => this.request("POST", "/templates", { body }),
    edit: (id: string, body: Json) => this.request("PATCH", `/templates/${enc(id)}`, { body }),
    delete: (id: string) => this.request("DELETE", `/templates/${enc(id)}`),
  };

  readonly media = {
    /** Sube por URL; para subir bytes usa uploadFile. */
    upload: (body: { type: string; url: string; filename?: string }) => this.request("POST", "/media", { body }),
    uploadFile: async (type: string, file: Blob, filename: string) => {
      const form = new FormData();
      form.append("type", type);
      form.append("file", file, filename);
      const res = await this.fetchImpl(`${this.baseUrl}/api/v1/media`, { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}` }, body: form });
      const parsed = (await res.json()) as Json & { error?: ApiErrorBody };
      if (!res.ok) throw new ColiblyError(res.status, parsed.error ?? { code: "http_error", message: `HTTP ${res.status}` });
      return parsed;
    },
    delete: (id: string) => this.request("DELETE", `/media/${enc(id)}`),
  };

  readonly calls = {
    list: (query?: Query) => this.request<Page<Json>>("GET", "/calls", { query }),
    get: (id: string) => this.request("GET", `/calls/${enc(id)}`),
  };

  /** Enlaces para que un cliente conecte su número de WhatsApp (agencias). */
  readonly onboardingLinks = {
    create: (body: { name?: string; reference?: string; redirectUrl?: string; expiresInHours?: number } = {}) => this.request("POST", "/onboarding-links", { body }),
    get: (id: string) => this.request("GET", `/onboarding-links/${enc(id)}`),
    cancel: (id: string) => this.request("DELETE", `/onboarding-links/${enc(id)}`),
  };

  readonly automations = {
    list: () => this.request<{ data: Json[] }>("GET", "/automations"),
    run: (id: string, body: { contactId: string; vars?: Record<string, string> }) => this.request("POST", `/automations/${enc(id)}/runs`, { body }),
  };
}

function enc(v: string): string {
  return encodeURIComponent(v);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoff(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export const SIGNATURE_HEADER = "x-colibly-signature";

/**
 * Verifica X-Colibly-Signature (t=<unix>,v1=<hmac>…) sobre el cuerpo crudo.
 * Acepta cualquier v1 (rotación de secreto) y rechaza firmas de más de
 * `toleranceSeconds` (300 por omisión). Sirve igual para el endpoint de Flows.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  header: string | null | undefined,
  secret: string,
  opts: { toleranceSeconds?: number; nowSeconds?: number } = {}
): boolean {
  if (!header || !secret) return false;
  let t = NaN;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t") t = Number(value);
    else if (key === "v1" && value) v1.push(value);
  }
  if (!Number.isFinite(t) || v1.length === 0) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? 300)) return false;
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest();
  return v1.some((candidate) => {
    const given = Buffer.from(candidate, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Verifica y devuelve el evento ya parseado; lanza si la firma no es válida. */
export function constructWebhookEvent<T = Json>(rawBody: string | Buffer, header: string | null | undefined, secret: string): T {
  if (!verifyWebhookSignature(rawBody, header, secret)) throw new Error("Firma de webhook inválida");
  return JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")) as T;
}
