import { NextResponse } from "next/server";
import { customerOAuthMetadata } from "@/lib/mcp/customer/oauth";
import { oauthPreflight, withOAuthCors } from "@/lib/oauth/common";

export const dynamic = "force-dynamic";

// RFC 8414 con ruta: el emisor del OAuth de clientes es <app>/oauth, así que
// sus metadatos viven en /.well-known/oauth-authorization-server/oauth. La
// raíz (sin ruta) es la del operador (../route.ts).
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.join("/") !== "oauth") return withOAuthCors(NextResponse.json({ error: "not_found" }, { status: 404 }));
  return withOAuthCors(NextResponse.json(customerOAuthMetadata(), { headers: { "Cache-Control": "public, max-age=300" } }));
}

export const OPTIONS = oauthPreflight;
