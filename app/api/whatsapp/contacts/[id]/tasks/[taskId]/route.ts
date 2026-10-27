import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { publicErrorMessage } from "@/lib/api-errors";

const patchSchema = z.object({
  done: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id, taskId } = await params;
    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);
    const task = await prisma.contactTask.findFirst({
      where: { id: taskId, contactId: id, contact: { OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] } },
    });
    if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const updated = await prisma.contactTask.update({
      where: { id: taskId },
      data: parsed.data,
      select: { id: true, title: true, done: true, createdAt: true },
    });
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
    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);
    const task = await prisma.contactTask.findFirst({
      where: { id: taskId, contactId: id, contact: { OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] } },
    });
    if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    await prisma.contactTask.delete({ where: { id: taskId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
