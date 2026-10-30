import { NextResponse } from "next/server";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { listOrganizations } from "@/lib/platform/ops";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requirePlatformToken(req, "platform:read");
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const pageSize = Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10);
  const data = await listOrganizations({
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 50,
  });
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
}
