import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/net/client-ip";
import { exchangeMcpAuthorizationCode, refreshMcpTokens, type McpTokenPair } from "@/lib/mcp/customer/oauth";
import { OAuthError, oauthFail, oauthPreflight, readOAuthBody, withOAuthCors } from "@/lib/oauth/common";

export const dynamic = "force-dynamic";

function tokenResponse(pair: McpTokenPair) {
  return withOAuthCors(
    NextResponse.json(
      {
        access_token: pair.accessToken,
        token_type: "Bearer",
        expires_in: pair.expiresIn,
        refresh_token: pair.refreshToken,
        scope: pair.scopes.join(" "),
      },
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }
    )
  );
}

// Token endpoint del MCP de clientes: canje del código (PKCE) y refresh con
// rotación. Clientes públicos: se identifican con client_id, sin secreto.
export async function POST(req: Request) {
  const { allowed } = await rateLimit(`mcp-oauth-token:${clientIp(req)}`, 30, 60);
  if (!allowed) return withOAuthCors(oauthFail(429, "slow_down", "Demasiadas solicitudes"));

  const body = await readOAuthBody(req);
  const clientId = body.client_id?.trim();
  if (!clientId) return withOAuthCors(oauthFail(401, "invalid_client", "Falta client_id"));

  try {
    if (body.grant_type === "authorization_code") {
      if (!body.code || !body.redirect_uri || !body.code_verifier) {
        return withOAuthCors(oauthFail(400, "invalid_request", "Faltan code, redirect_uri o code_verifier"));
      }
      return tokenResponse(
        await exchangeMcpAuthorizationCode({
          code: body.code,
          clientId,
          redirectUri: body.redirect_uri,
          codeVerifier: body.code_verifier,
          resource: body.resource,
        })
      );
    }
    if (body.grant_type === "refresh_token") {
      if (!body.refresh_token) return withOAuthCors(oauthFail(400, "invalid_request", "Falta refresh_token"));
      return tokenResponse(await refreshMcpTokens({ refreshToken: body.refresh_token, clientId }));
    }
    return withOAuthCors(oauthFail(400, "unsupported_grant_type", "grant_type no soportado"));
  } catch (error) {
    if (error instanceof OAuthError) return withOAuthCors(oauthFail(error.status, error.code, error.message));
    console.error("[oauth/token]", error);
    return withOAuthCors(oauthFail(500, "server_error", "No se pudo emitir el token"));
  }
}

export const OPTIONS = oauthPreflight;
