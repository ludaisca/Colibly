import { NextResponse } from "next/server";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { getWhatsAppHealth } from "@/lib/platform/support";
import { opsResponse } from "@/lib/platform/http";

export const dynamic = "force-dynamic";

// GET ?organizationId=&accountId=&page= — estado de los números contra Meta.
export async function GET(req: Request) {
  const ctx = await requirePlatformToken(req, "platform:read");
  if (ctx instanceof NextResponse) return ctx;
  const url = new URL(req.url);
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return opsResponse(
    await getWhatsAppHealth({
      organizationId: url.searchParams.get("organizationId") ?? undefined,
      accountId: url.searchParams.get("accountId") ?? undefined,
      page: Number.isFinite(page) ? page : 1,
    })
  );
}
