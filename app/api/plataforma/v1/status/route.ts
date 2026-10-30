import { NextResponse } from "next/server";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { getPlatformDiagnostics } from "@/lib/platform/diagnostics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requirePlatformToken(req, "platform:read");
  if (ctx instanceof NextResponse) return ctx;

  const live = new URL(req.url).searchParams.get("live") === "1";
  const report = await getPlatformDiagnostics({ live });
  return NextResponse.json({ ok: true, data: report }, { headers: { "Cache-Control": "no-store" } });
}
