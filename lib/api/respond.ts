import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { publicErrorMessage } from "@/lib/api-errors";
import { applyRateLimitHeaders } from "./rate-headers";
import { API_MAX_BODY_BYTES, API_PAGE_DEFAULT, API_PAGE_MAX, API_SCHEMA_VERSION, API_SCHEMA_VERSION_HEADER } from "./constants";

// Respuestas de la API pública (/api/v1). Forma de error estable para que las
// integraciones puedan ramificar por `code` sin parsear mensajes en español:
//   { "error": { "code": "not_found", "message": "Contacto no encontrado" } }
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "rate_limited"
  | "limit_reached"
  | "idempotency_conflict"
  | "window_closed"
  | "plan_limit"
  | "read_only"
  | "upstream_error"
  | "internal_error"
  | "payload_too_large"
  | "daily_limit_reached"
  | "service_unavailable"
  | "method_not_allowed"
  | "required_fields";

/** Un problema concreto del cuerpo: `path` con puntos (`template.id`, `buttons.0.title`); "" = el cuerpo entero. */
export interface ApiErrorDetail {
  path: string;
  message: string;
}

// Id de cada solicitud (X-Request-Id y `error.requestId`): lo que un
// integrador nos manda a soporte para encontrar su llamada en los logs.
export const REQUEST_ID_HEADER = "X-Request-Id";
const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export function newRequestId(): string {
  return `req_${randomBytes(12).toString("base64url")}`;
}

export function currentRequestId(): string | null {
  return requestContext.getStore()?.requestId ?? null;
}

export function apiError(status: number, code: ApiErrorCode, message: string, headers?: HeadersInit, details?: ApiErrorDetail[]): NextResponse {
  const requestId = currentRequestId();
  const error: Record<string, unknown> = { code, message };
  if (details?.length) error.details = details;
  if (requestId) error.requestId = requestId;
  return NextResponse.json({ error }, { status, headers });
}

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

// Error lanzado desde helpers para cortar el handler con una respuesta concreta.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly headers?: Record<string, string>,
    public readonly details?: ApiErrorDetail[]
  ) {
    super(message);
  }
}

// Lee y valida el cuerpo JSON de un POST/PATCH. Errores pensados para quien
// integra: cuerpo vacío o JSON mal formado con su propio mensaje (no "se
// esperaba objeto, recibido nulo"), y los de validación en español con la
// ruta del campo — el primero en `message`, todos en `details`.
// Los mensajes propios de cada esquema (lib/api/schemas.ts) ganan al locale.
const ES_LOCALE = z.locales.es();

export function issuesToDetails(issues: readonly z.core.$ZodIssue[]): ApiErrorDetail[] {
  return issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

export function detailsMessage(details: ApiErrorDetail[]): string {
  const first = details[0];
  if (!first) return "Cuerpo inválido";
  const head = first.path ? `${first.path}: ${first.message}` : first.message;
  return details.length > 1 ? `${head} (y ${details.length - 1} más en details)` : head;
}

/** `optional`: un cuerpo vacío vale como `{}` (endpoints con opciones, p. ej. rotate-secret). */
export async function readJsonBody<S extends z.ZodType>(req: Request, schema: S, opts: { optional?: boolean } = {}): Promise<z.infer<S>> {
  let raw: string;
  try {
    raw = await req.text();
  } catch (err) {
    if (bodyOverflowed(req) || err instanceof ApiError) throw err instanceof ApiError ? err : payloadTooLarge(API_MAX_BODY_BYTES);
    throw new ApiError(400, "invalid_request", "No se pudo leer el cuerpo de la solicitud");
  }
  if (!raw.trim() && opts.optional) raw = "{}";
  if (!raw.trim()) {
    throw new ApiError(400, "invalid_request", "El cuerpo está vacío: envía un objeto JSON con Content-Type: application/json");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    const pos = err instanceof Error ? /position (\d+)/.exec(err.message)?.[1] : undefined;
    throw new ApiError(400, "invalid_request", `El cuerpo no es JSON válido${pos ? ` (error en la posición ${pos})` : ""}`);
  }
  const parsed = schema.safeParse(body, { error: ES_LOCALE.localeError });
  if (!parsed.success) {
    const details = issuesToDetails(parsed.error.issues);
    throw new ApiError(400, "invalid_request", detailsMessage(details), undefined, details);
  }
  return parsed.data;
}

// 405 en JSON con `Allow` (Next respondería un 405 vacío): cada ruta de
// /api/v1 exporta los métodos que no atiende con este handler.
export function methodNotAllowed(...allowed: string[]) {
  const allow = allowed.join(", ");
  return async (req: Request): Promise<Response> =>
    requestContext.run({ requestId: newRequestId() }, () =>
      finish(apiError(405, "method_not_allowed", `${req.method} no está permitido en ${new URL(req.url).pathname}. Métodos: ${allow}`, { Allow: allow }))
    );
}

// Headers comunes de toda respuesta de /api/v1 (versión del contrato e id de solicitud).
function finish(res: Response): Response {
  const out = withSchemaVersion(res);
  const id = currentRequestId();
  if (id) {
    try {
      out.headers.set(REQUEST_ID_HEADER, id);
    } catch {
      // Headers inmutables: se entrega sin el id.
    }
  }
  return out;
}

// Envuelve un handler: ApiError → su respuesta; cualquier otra cosa → 500 sin
// filtrar detalles de Prisma (publicErrorMessage ya los registra). Agrega los
// headers X-RateLimit-* que dejó authenticateApiKey.
export function withApiErrors<A extends [Request, ...unknown[]]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> =>
    requestContext.run({ requestId: currentRequestId() ?? newRequestId() }, async () => {
      let res: Response;
      try {
        args[0] = guardRequestBody(args[0]);
        res = await handler(...args);
      } catch (err) {
        if (err instanceof ApiError) {
          res = apiError(err.status, err.code, err.message, err.headers, err.details);
        } else {
          console.error(`[api] ${currentRequestId()} ${args[0].method} ${new URL(args[0].url).pathname}: error interno`);
          res = apiError(500, "internal_error", publicErrorMessage(err, "Error interno del servidor"));
        }
      }
      if (bodyOverflowed(args[0])) {
        const tooLarge = payloadTooLarge(API_MAX_BODY_BYTES);
        res = apiError(tooLarge.status, tooLarge.code, tooLarge.message);
      }
      return finish(applyRateLimitHeaders(args[0], res));
    });
}

/** Para respuestas armadas fuera de withApiErrors (p. ej. el 404 del catch-all). */
export function withRequestContext(fn: () => Response): Response {
  return requestContext.run({ requestId: newRequestId() }, () => finish(fn()));
}

/** Envoltura externa (p. ej. withIdempotency): sus propias respuestas también llevan el id. */
export function withRequestScope<A extends [Request, ...unknown[]]>(handler: (...args: A) => Promise<Response>) {
  return (...args: A): Promise<Response> =>
    requestContext.run({ requestId: currentRequestId() ?? newRequestId() }, async () => finish(await handler(...args)));
}

export function withSchemaVersion(res: Response): Response {
  try {
    res.headers.set(API_SCHEMA_VERSION_HEADER, API_SCHEMA_VERSION);
  } catch {
    // Headers inmutables (respuesta reenviada tal cual): se entrega sin el header.
  }
  return res;
}

// Cuerpo máximo (API_MAX_BODY_BYTES, 1 MB). Con Content-Length se decide sin
// leer nada (proxy.ts ya corta antes). Sin él (chunked), el handler recibe una
// copia del Request cuyo cuerpo se corta al pasar el tope: nunca se carga en
// memoria más de ~1 MB y la respuesta es 413 aunque el handler haya tragado el
// error de lectura (p. ej. `req.json().catch(() => null)`).
const bodyGuards = new WeakMap<Request, { overflow: boolean }>();

function payloadTooLarge(max: number): ApiError {
  return new ApiError(413, "payload_too_large", `El cuerpo supera el máximo de ${Math.round(max / 1024)} KB`);
}

export function guardRequestBody<R extends Request>(req: R, max = API_MAX_BODY_BYTES): R {
  if (bodyGuards.has(req)) return req;
  const declared = req.headers.get("content-length");
  if (declared !== null && Number(declared) > max) throw payloadTooLarge(max);
  if (declared !== null || !req.body || req.method === "GET" || req.method === "HEAD") {
    bodyGuards.set(req, { overflow: false });
    return req;
  }
  const guard = { overflow: false };
  let total = 0;
  const limited = req.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > max) {
          guard.overflow = true;
          controller.error(payloadTooLarge(max));
          return;
        }
        controller.enqueue(chunk);
      },
    })
  );
  const out = new Request(req, { body: limited, duplex: "half" } as RequestInit) as R;
  bodyGuards.set(out, guard);
  return out;
}

export function bodyOverflowed(req: Request): boolean {
  return bodyGuards.get(req)?.overflow ?? false;
}

// Paginación por cursor: `limit` (1-API_PAGE_MAX, default API_PAGE_DEFAULT) + `cursor` opaco.
// Un `limit` que no es un entero positivo es un error del cliente (400); uno
// mayor que el máximo se recorta al máximo (documentado), como siempre.
export function readPageParams(url: URL): { limit: number; cursor: string | null } {
  const param = url.searchParams.get("limit");
  if (param === null || param === "") return { limit: API_PAGE_DEFAULT, cursor: url.searchParams.get("cursor") };
  if (!/^\d+$/.test(param.trim()) || Number(param) < 1) {
    throw new ApiError(400, "invalid_request", `limit debe ser un entero entre 1 y ${API_PAGE_MAX}`);
  }
  return { limit: Math.min(API_PAGE_MAX, Number(param)), cursor: url.searchParams.get("cursor") };
}

// Fecha ISO 8601 opcional de la query (updatedSince, since…): 400 si no se entiende.
export function readDateParam(url: URL, name: string): Date | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "invalid_request", `${name} debe ser una fecha ISO 8601`);
  return d;
}

// Cursor = base64url de un JSON pequeño (fecha + id para desempatar). Opaco
// para el cliente; se valida al decodificar.
export function encodeCursor(value: { t: string; id: string }): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor(cursor: string | null): { t: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const t = new Date(parsed.t);
    if (typeof parsed.id !== "string" || Number.isNaN(t.getTime())) throw new Error();
    return { t, id: parsed.id };
  } catch {
    throw new ApiError(400, "invalid_request", "cursor inválido");
  }
}
