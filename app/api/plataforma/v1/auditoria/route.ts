import { NextResponse } from "next/server";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { listAudit } from "@/lib/platform/ops";

export const dynamic = "force-dynamic";

function date(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function GET(req: Request) {
  const ctx = await requirePlatformToken(req, "platform:read");
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const pageSize = Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10);
  const data = await listAudit({
    action: url.searchParams.get("action") ?? undefined,
    targetId: url.searchParams.get("targetId") ?? undefined,
    from: date(url.searchParams.get("from")),
    to: date(url.searchParams.get("to")),
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 50,
  });
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
}
