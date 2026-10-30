import { NextResponse } from "next/server";
import { mcpResource, oauthIssuer, oauthScopesSupported } from "@/lib/platform/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      resource: mcpResource(),
      authorization_servers: [oauthIssuer()],
      scopes_supported: oauthScopesSupported(),
      bearer_methods_supported: ["header"],
      resource_documentation: `${oauthIssuer()}/docs/api`,
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
