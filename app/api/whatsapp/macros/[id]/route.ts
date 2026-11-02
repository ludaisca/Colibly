import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/tenancy";
import { forbidRoles } from "@/lib/roles";
import { macroUpdateSchema } from "@/lib/macros/types";
import { publicErrorMessage } from "@/lib/api-errors";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { id } = await params;
    const organizationId = await requireOrgId(session.user.id);
    const existing = await prisma.macro.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Macro no encontrada" }, { status: 404 });

    const parsed = macroUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const macro = await prisma.macro.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
        ...(parsed.data.actions !== undefined ? { actions: parsed.data.actions } : {}),
      },
      select: { id: true, name: true, description: true, actions: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json(macro);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { id } = await params;
    const organizationId = await requireOrgId(session.user.id);
    const existing = await prisma.macro.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Macro no encontrada" }, { status: 404 });
    await prisma.macro.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
