import { NextResponse } from "next/server";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { testWebhook } from "@/lib/platform/ops";
import { opsResponse } from "@/lib/platform/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await requirePlatformToken(req, "billing:write");
  if (ctx instanceof NextResponse) return ctx;
  return opsResponse(await testWebhook());
}
