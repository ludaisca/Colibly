import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/net/client-ip";
import { revokeOAuthToken } from "@/lib/platform/oauth";

export const dynamic = "force-dynamic";

// RFC 7009: siempre 200, exista o no el token.
export async function POST(req: Request) {
  const ip = clientIp(req);
  const { allowed } = await rateLimit(`mcp-oauth-revoke:${ip}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: "slow_down" }, { status: 429 });

  const type = req.headers.get("content-type") ?? "";
  let token: string | null = null;
  if (type.includes("application/json")) {
    const body = await req.json().catch(() => null);
    token = typeof body?.token === "string" ? body.token : null;
  } else {
    const form = await req.formData().catch(() => null);
    const value = form?.get("token");
    token = typeof value === "string" ? value : null;
  }

  if (token) await revokeOAuthToken(token);
  return new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
