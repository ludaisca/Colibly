import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/api-errors";
import { applyRateLimitHeaders } from "./rate-headers";
import { API_MAX_BODY_BYTES, API_PAGE_DEFAULT, API_PAGE_MAX } from "./constants";

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
  | "service_unavailable";

export function apiError(status: number, code: ApiErrorCode, message: string, headers?: HeadersInit): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers });
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
    public readonly headers?: Record<string, string>
  ) {
    super(message);
  }
}

// Envuelve un handler: ApiError → su respuesta; cualquier otra cosa → 500 sin
// filtrar detalles de Prisma (publicErrorMessage ya los registra). Agrega los
// headers X-RateLimit-* que dejó authenticateApiKey.
export function withApiErrors<A extends [Request, ...unknown[]]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    let res: Response;
    try {
      args[0] = guardRequestBody(args[0]);
      res = await handler(...args);
    } catch (err) {
      res =
        err instanceof ApiError
          ? apiError(err.status, err.code, err.message, err.headers)
          : apiError(500, "internal_error", publicErrorMessage(err, "Error interno del servidor"));
    }
    if (bodyOverflowed(args[0])) {
      const tooLarge = payloadTooLarge(API_MAX_BODY_BYTES);
      res = apiError(tooLarge.status, tooLarge.code, tooLarge.message);
    }
    return applyRateLimitHeaders(args[0], res);
  };
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
export function readPageParams(url: URL): { limit: number; cursor: string | null } {
  const raw = Number(url.searchParams.get("limit") ?? API_PAGE_DEFAULT);
  const limit = Number.isFinite(raw) ? Math.min(API_PAGE_MAX, Math.max(1, Math.floor(raw))) : API_PAGE_DEFAULT;
  return { limit, cursor: url.searchParams.get("cursor") };
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
