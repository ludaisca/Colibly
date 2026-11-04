import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

// Respuestas JSON con ETag para los endpoints que el cliente sondea (bandeja,
// mensajes, campana). La consulta se sigue haciendo, pero si el resultado no
// cambió el servidor responde 304 sin cuerpo y el navegador reutiliza su copia:
// el poll de mensajes bajaba ~260 KB por minuto por agente con el chat quieto.
// `private, no-cache` obliga a revalidar siempre (nunca se sirve viejo) y
// evita que un proxy compartido lo guarde.

export function weakEtag(body: string): string {
  return `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 27)}"`;
}

function matches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((value) => value.trim() === etag || value.trim() === "*");
}

export function jsonWithEtag(req: Request, data: unknown, init?: { headers?: Record<string, string> }): NextResponse {
  const body = JSON.stringify(data);
  const etag = weakEtag(body);
  const headers = { ...init?.headers, ETag: etag, "Cache-Control": "private, no-cache" };
  if (matches(req.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(body, { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
}
