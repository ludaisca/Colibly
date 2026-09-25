import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/api-errors";

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
  | "window_closed"
  | "upstream_error"
  | "internal_error";

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
    message: string
  ) {
    super(message);
  }
}

// Envuelve un handler: ApiError → su respuesta; cualquier otra cosa → 500 sin
// filtrar detalles de Prisma (publicErrorMessage ya los registra).
export function withApiErrors<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) return apiError(err.status, err.code, err.message);
      return apiError(500, "internal_error", publicErrorMessage(err, "Error interno del servidor"));
    }
  };
}

// Paginación por cursor: `limit` (1-100, default 25) + `cursor` opaco.
export function readPageParams(url: URL): { limit: number; cursor: string | null } {
  const raw = Number(url.searchParams.get("limit") ?? 25);
  const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.floor(raw))) : 25;
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
