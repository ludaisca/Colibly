import { NextResponse } from "next/server";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { getBillingState } from "@/lib/platform/ops";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requirePlatformToken(req, "platform:read");
  if (ctx instanceof NextResponse) return ctx;

  const result = await getBillingState();
  if (!result.ok) return NextResponse.json({ error: { code: result.code, message: result.message } }, { status: result.status });
  return NextResponse.json({ ok: true, data: result.data }, { headers: { "Cache-Control": "no-store" } });
}
