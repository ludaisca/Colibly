import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/net/client-ip";
import { exchangeAuthorizationCode, refreshOAuthTokens, OAuthError } from "@/lib/platform/oauth";

export const dynamic = "force-dynamic";

async function readBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const json = await req.json().catch(() => null);
    return json && typeof json === "object" ? (json as Record<string, string>) : {};
  }
  const form = await req.formData().catch(() => null);
  if (!form) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function fail(status: number, code: string, description: string) {
  return NextResponse.json(
    { error: code, error_description: description },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const { allowed } = await rateLimit(`mcp-oauth-token:${ip}`, 20, 60);
  if (!allowed) return fail(429, "slow_down", "Demasiadas solicitudes");

  const body = await readBody(req);
  const clientId = body.client_id?.trim();
  if (!clientId) return fail(400, "invalid_client", "Falta client_id");

  try {
    if (body.grant_type === "authorization_code") {
      if (!body.code || !body.redirect_uri || !body.code_verifier) {
        return fail(400, "invalid_request", "Faltan code, redirect_uri o code_verifier");
      }
      const pair = await exchangeAuthorizationCode({
        code: body.code,
        clientId,
        redirectUri: body.redirect_uri,
        codeVerifier: body.code_verifier,
        resource: body.resource,
      });
      return NextResponse.json(
        {
          access_token: pair.accessToken,
          token_type: "Bearer",
          expires_in: pair.expiresIn,
          refresh_token: pair.refreshToken,
          scope: pair.scopes.join(" "),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (body.grant_type === "refresh_token") {
      if (!body.refresh_token) return fail(400, "invalid_request", "Falta refresh_token");
      const pair = await refreshOAuthTokens({ refreshToken: body.refresh_token, clientId });
      return NextResponse.json(
        {
          access_token: pair.accessToken,
          token_type: "Bearer",
          expires_in: pair.expiresIn,
          refresh_token: pair.refreshToken,
          scope: pair.scopes.join(" "),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return fail(400, "unsupported_grant_type", "grant_type no soportado");
  } catch (error) {
    if (error instanceof OAuthError) return fail(error.status, error.code, error.message);
    console.error("[mcp/oauth/token]", error);
    return fail(500, "server_error", "No se pudo emitir el token");
  }
}
