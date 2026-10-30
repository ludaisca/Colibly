import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { setOrgInternal } from "@/lib/platform/ops";
import { opsResponse, tokenActor } from "@/lib/platform/http";

export const dynamic = "force-dynamic";

const schema = z.object({ internal: z.boolean(), confirm: z.boolean() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatformToken(req, "org:write");
  if (ctx instanceof NextResponse) return ctx;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: parsed.error.issues[0].message } }, { status: 400 });
  if (!parsed.data.confirm) return NextResponse.json({ error: { code: "invalid_request", message: "Confirma con confirm=true" } }, { status: 400 });

  const { id } = await params;
  return opsResponse(await setOrgInternal(id, parsed.data.internal, tokenActor(ctx)));
}
