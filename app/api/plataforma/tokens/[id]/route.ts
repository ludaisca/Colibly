import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { logPlatformAction } from "@/lib/platform/audit";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const token = await prisma.platformApiToken.findUnique({
    where: { id },
    select: { id: true, name: true, revokedAt: true },
  });
  if (!token) return NextResponse.json({ error: "Token no encontrado" }, { status: 404 });

  if (!token.revokedAt) {
    await prisma.platformApiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    await logPlatformAction({
      actor: { type: "user", email: admin.email },
      action: "platform.token.revoke",
      target: { type: "platform_token", id },
      before: { revokedAt: null },
      after: { revokedAt: new Date().toISOString() },
    });
  }

  return NextResponse.json({ ok: true });
}
