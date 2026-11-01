import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { monitorSchema, monitorSession } from "../_shared";

// Editar / borrar un monitor de la propia organización (ids ajenos → 404).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await monitorSession();
    if (ctx instanceof NextResponse) return ctx;
    const { id } = await params;
    const parsed = monitorSchema.partial().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const updated = await prisma.topicMonitor.updateMany({ where: { id, organizationId: ctx.organizationId }, data: parsed.data });
    if (updated.count === 0) return NextResponse.json({ error: "Monitor no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await monitorSession();
    if (ctx instanceof NextResponse) return ctx;
    const { id } = await params;
    const deleted = await prisma.topicMonitor.deleteMany({ where: { id, organizationId: ctx.organizationId } });
    if (deleted.count === 0) return NextResponse.json({ error: "Monitor no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}
