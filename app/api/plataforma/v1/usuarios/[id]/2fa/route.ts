import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { resetUserTwoFactor } from "@/lib/platform/support";
import { opsResponse, tokenActor } from "@/lib/platform/http";

export const dynamic = "force-dynamic";

const schema = z.object({ reason: z.string().min(5).max(500), confirm: z.boolean() });

// DELETE — quita la 2FA y cierra las sesiones del usuario (soporte).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatformToken(req, "user:write");
  if (ctx instanceof NextResponse) return ctx;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: parsed.error.issues[0].message } }, { status: 400 });
  if (!parsed.data.confirm) return NextResponse.json({ error: { code: "invalid_request", message: "Confirma con confirm=true" } }, { status: 400 });

  const { id } = await params;
  return opsResponse(await resetUserTwoFactor({ userId: id, reason: parsed.data.reason, actor: tokenActor(ctx) }));
}
