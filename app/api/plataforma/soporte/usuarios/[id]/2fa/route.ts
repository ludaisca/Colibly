import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { resetUserTwoFactor } from "@/lib/platform/support";
import { opsResponse } from "@/lib/platform/http";

export const dynamic = "force-dynamic";

const schema = z.object({ reason: z.string().min(5).max(500) });

// Panel /plataforma → Soporte: quitar la 2FA a un usuario bloqueado.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: "Escribe el motivo (mínimo 5 caracteres)" } }, { status: 400 });
  const { id } = await params;
  return opsResponse(await resetUserTwoFactor({ userId: id, reason: parsed.data.reason, actor: { type: "user", email: admin.email } }));
}
