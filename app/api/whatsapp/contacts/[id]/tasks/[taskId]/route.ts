import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contactScopeWhere } from "@/lib/contacts/scope";
import { publicErrorMessage } from "@/lib/api-errors";
import { recordContactActivity } from "@/lib/contacts/activity";

const patchSchema = z.object({
  done: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id, taskId } = await params;
    const scope = await contactScopeWhere(session.user.id);
    const task = await prisma.contactTask.findFirst({
      where: { id: taskId, contactId: id, contact: { ...scope } },
    });
    if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const updated = await prisma.contactTask.update({
      where: { id: taskId },
      data: parsed.data,
      select: { id: true, title: true, done: true, createdAt: true },
    });
    if (parsed.data.done !== undefined && parsed.data.done !== task.done) {
      await recordContactActivity({
        contactId: id,
        type: parsed.data.done ? "TASK_COMPLETED" : "TASK_REOPENED",
        title: `${parsed.data.done ? "Tarea completada" : "Tarea reabierta"}: ${task.title}`,
        actorId: session.user.id,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id, taskId } = await params;
    const scope = await contactScopeWhere(session.user.id);
    const task = await prisma.contactTask.findFirst({
      where: { id: taskId, contactId: id, contact: { ...scope } },
    });
    if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    await prisma.contactTask.delete({ where: { id: taskId } });
    await recordContactActivity({
      contactId: id,
      type: "TASK_DELETED",
      title: `Tarea eliminada: ${task.title}`,
      actorId: session.user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
