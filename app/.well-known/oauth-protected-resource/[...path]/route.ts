import { NextResponse } from "next/server";
import { customerResourceMetadata } from "@/lib/mcp/customer/oauth";
import { oauthPreflight, withOAuthCors } from "@/lib/oauth/common";

export const dynamic = "force-dynamic";

// RFC 9728 con ruta: metadatos del MCP de clientes (/api/v1/mcp). El 401 del
// MCP apunta aquí en WWW-Authenticate (resource_metadata). La raíz es la del
// MCP del operador (../route.ts).
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.join("/") !== "api/v1/mcp") return withOAuthCors(NextResponse.json({ error: "not_found" }, { status: 404 }));
  return withOAuthCors(NextResponse.json(customerResourceMetadata(), { headers: { "Cache-Control": "public, max-age=300" } }));
}

export const OPTIONS = oauthPreflight;
