import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/net/client-ip";
import { revokeMcpToken } from "@/lib/mcp/customer/oauth";
import { oauthFail, oauthPreflight, readOAuthBody, withOAuthCors } from "@/lib/oauth/common";

export const dynamic = "force-dynamic";

// RFC 7009: siempre 200, exista o no el token. Revocar cualquiera de los dos
// desconecta la app (revoca la key que respalda la conexión).
export async function POST(req: Request) {
  const { allowed } = await rateLimit(`mcp-oauth-revoke:${clientIp(req)}`, 30, 60);
  if (!allowed) return withOAuthCors(oauthFail(429, "slow_down", "Demasiadas solicitudes"));
  const body = await readOAuthBody(req);
  if (body.token) await revokeMcpToken(body.token);
  return withOAuthCors(new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } }));
}

export const OPTIONS = oauthPreflight;
