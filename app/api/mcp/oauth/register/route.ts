import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/net/client-ip";
import { registerOAuthClient, OAuthError } from "@/lib/platform/oauth";

export const dynamic = "force-dynamic";

// Dynamic Client Registration (RFC 7591). Solo clientes públicos con PKCE:
// el consentimiento del operador es lo que impide que un cliente anónimo
// obtenga acceso por sí solo.
const schema = z.object({
  client_name: z.string().trim().min(1).max(120),
  redirect_uris: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const { allowed } = await rateLimit(`mcp-oauth-register:${ip}`, 10, 3600);
  if (!allowed) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;
  if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== "none") {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "Solo se admiten clientes públicos (none + PKCE)" }, { status: 400 });
  }
  if (input.grant_types && input.grant_types.some((grant) => !["authorization_code", "refresh_token"].includes(grant))) {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "grant_type no soportado" }, { status: 400 });
  }

  try {
    const client = await registerOAuthClient({ clientName: input.client_name, redirectUris: input.redirect_uris });
    return NextResponse.json(
      {
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: client.grantTypes,
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof OAuthError) {
      return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
