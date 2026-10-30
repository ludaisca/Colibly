import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { rotateWebhook } from "@/lib/platform/ops";
import { opsResponse, tokenActor } from "@/lib/platform/http";

export const dynamic = "force-dynamic";

const schema = z.object({ confirm: z.string() });

export async function POST(req: Request) {
  const ctx = await requirePlatformToken(req, "billing:write");
  if (ctx instanceof NextResponse) return ctx;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: parsed.error.issues[0].message } }, { status: 400 });
  if (parsed.data.confirm !== "ROTAR") {
    return NextResponse.json({ error: { code: "invalid_request", message: 'Escribe confirm: "ROTAR"' } }, { status: 400 });
  }

  return opsResponse(await rotateWebhook(tokenActor(ctx)));
}
