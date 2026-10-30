import { NextResponse } from "next/server";
import { oauthIssuer, oauthScopesSupported } from "@/lib/platform/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const issuer = oauthIssuer();
  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/api/mcp/oauth/authorize`,
      token_endpoint: `${issuer}/api/mcp/oauth/token`,
      registration_endpoint: `${issuer}/api/mcp/oauth/register`,
      revocation_endpoint: `${issuer}/api/mcp/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: oauthScopesSupported(),
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
