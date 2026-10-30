import { NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticatePlatformCredential } from "@/lib/platform/tokens";
import { registerPlatformTools } from "@/lib/mcp/tools";
import { appUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MCP remoto sobre Streamable HTTP, sin estado: cada request se autentica con
// su Bearer (plt_ o poa_) y crea su propio server/transport. No hay sesiones
// que compartir entre instancias.
async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(appUrl("/")).origin) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const ctx = await authenticatePlatformCredential(req);
  if (ctx instanceof NextResponse) return ctx;

  const server = new McpServer({ name: "colibly-platform", version: "1.0.0" });
  registerPlatformTools(server, ctx);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    keepAliveMs: 0,
    maxRequestBodySize: 64 * 1024,
  });

  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function DELETE(req: Request) {
  return handle(req);
}
