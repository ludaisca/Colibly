import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { publicErrorMessage } from "@/lib/api-errors";
import { serializeApiKey } from "@/lib/api/keys";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  // Revocar es irreversible: una key filtrada no debe poder "reactivarse".
  revoked: z.literal(true).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const existing = await prisma.apiKey.findFirst({ where: { id, userId: admin.userId } });
    if (!existing) return NextResponse.json({ error: "API key no encontrada" }, { status: 404 });

    const updated = await prisma.apiKey.update({
      where: { id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.revoked && !existing.revokedAt ? { revokedAt: new Date() } : {}),
      },
    });
    return NextResponse.json(serializeApiKey(updated));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await params;
    const { count } = await prisma.apiKey.deleteMany({ where: { id, userId: admin.userId } });
    if (count === 0) return NextResponse.json({ error: "API key no encontrada" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
