import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/net/client-ip";
import { registerMcpClient } from "@/lib/mcp/customer/oauth";
import { OAuthError, oauthFail, oauthPreflight, withOAuthCors } from "@/lib/oauth/common";

export const dynamic = "force-dynamic";

// Registro dinámico (RFC 7591) del MCP de clientes. Solo clientes públicos con
// PKCE: registrarse no da acceso a nada; lo da el consentimiento de un admin.
const schema = z.object({
  client_name: z.string().trim().max(200).optional(),
  redirect_uris: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

export async function POST(req: Request) {
  const { allowed } = await rateLimit(`mcp-oauth-register:${clientIp(req)}`, 20, 3600);
  if (!allowed) return withOAuthCors(oauthFail(429, "slow_down", "Demasiados registros desde esta IP"));

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withOAuthCors(oauthFail(400, "invalid_client_metadata", parsed.error.issues[0].message));
  const input = parsed.data;
  if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== "none") {
    return withOAuthCors(oauthFail(400, "invalid_client_metadata", "Solo se admiten clientes públicos (none + PKCE)"));
  }
  if (input.grant_types?.some((grant) => !["authorization_code", "refresh_token"].includes(grant))) {
    return withOAuthCors(oauthFail(400, "invalid_client_metadata", "grant_type no soportado"));
  }
  if (input.response_types?.some((type) => type !== "code")) {
    return withOAuthCors(oauthFail(400, "invalid_client_metadata", "response_type no soportado"));
  }

  try {
    const client = await registerMcpClient({ clientName: input.client_name ?? "", redirectUris: input.redirect_uris });
    return withOAuthCors(
      NextResponse.json(
        {
          client_id: client.clientId,
          client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
          client_name: client.clientName,
          redirect_uris: client.redirectUris,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
        { status: 201, headers: { "Cache-Control": "no-store" } }
      )
    );
  } catch (error) {
    if (error instanceof OAuthError) return withOAuthCors(oauthFail(error.status, error.code, error.message));
    console.error("[oauth/register]", error);
    return withOAuthCors(oauthFail(500, "server_error", "No se pudo registrar el cliente"));
  }
}

export const OPTIONS = oauthPreflight;
