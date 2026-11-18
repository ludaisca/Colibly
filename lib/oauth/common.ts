import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";

// Piezas puras de OAuth 2.1 que comparten los dos servidores de autorización:
// el del operador (lib/platform/oauth.ts → /api/mcp) y el de clientes
// (lib/mcp/customer/oauth.ts → /api/v1/mcp). Cada uno guarda sus clientes,
// códigos y tokens en tablas propias.

export class OAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function randomOAuthToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** code_challenge S256: base64url de 43 caracteres (también se admiten hasta 128). */
export function isValidCodeChallenge(value: string | null | undefined): value is string {
  return !!value && /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

/** https, o http solo en loopback (clientes de escritorio). */
export function isValidRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")) return true;
    return false;
  } catch {
    return false;
  }
}

// Esquemas que nunca son una app que recibe el código (RFC 8252 §7.1 admite
// esquemas propios como cursor:// o vscode://; estos no lo son).
const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "about:", "blob:", "ftp:", "ws:", "wss:", "http:", "https:", "mailto:", "tel:", "sms:", "intent:", "chrome:", "view-source:"]);

/**
 * Redirect URI de un cliente MCP público: https, http en loopback, o el
 * esquema propio de una app de escritorio (cursor://, vscode://…). PKCE es lo
 * que protege el código si otra app reclama el mismo esquema. Pura.
 */
export function isValidPublicClientRedirectUri(uri: string): boolean {
  if (isValidRedirectUri(uri)) return true;
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    const scheme = url.protocol.toLowerCase();
    if (BLOCKED_SCHEMES.has(scheme)) return false;
    // Esquema propio: letras, dígitos, + . - (y al menos una letra al inicio).
    return /^[a-z][a-z0-9+.-]{1,40}:$/.test(scheme);
  } catch {
    return false;
  }
}

/** Cuerpo de /token y /revoke: form-urlencoded (lo normal) o JSON. */
export async function readOAuthBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== "object") return {};
    return Object.fromEntries(Object.entries(json as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  const form = await req.formData().catch(() => null);
  if (!form) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export function oauthFail(status: number, code: string, description: string): NextResponse {
  return NextResponse.json({ error: code, error_description: description }, { status, headers: { "Cache-Control": "no-store" } });
}

// Metadatos, registro, token y revocación los puede llamar un cliente MCP que
// corre en el navegador: CORS abierto, sin cookies (los clientes son públicos
// y nada de esto depende de la sesión).
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function withOAuthCors<T extends Response>(res: T): T {
  for (const [key, value] of Object.entries(CORS_HEADERS)) res.headers.set(key, value);
  return res;
}

export function oauthPreflight(): Response {
  return withOAuthCors(new Response(null, { status: 204 }));
}
