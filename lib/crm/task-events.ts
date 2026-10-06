import { prisma } from "@/lib/prisma";
import { emitDomainEvent } from "@/lib/events/emit";

// Eventos de tareas y personas (webhooks `task.created`, `task.completed`,
// `person.created`). Son de toda la organización: no cuelgan de una cuenta de
// canal, así que solo llegan a webhooks sin recorte de cuentas. Se llaman
// DESPUÉS de confirmar la transacción y nunca lanzan.

export async function emitTaskEvent(type: "task.created" | "task.completed", taskId: string): Promise<void> {
  try {
    const t = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, organizationId: true, title: true, kind: true, status: true, dueAt: true, assigneeId: true, completedById: true, personId: true, companyId: true, dealId: true, source: true },
    });
    if (!t) return;
    await emitDomainEvent({
      type,
      account: null,
      organizationId: t.organizationId,
      contactId: null,
      chat: null,
      data: {
        taskId: t.id,
        title: t.title,
        kind: t.kind,
        status: t.status,
        dueAt: t.dueAt?.toISOString() ?? null,
        assigneeId: t.assigneeId,
        completedById: t.completedById,
        personId: t.personId,
        companyId: t.companyId,
        dealId: t.dealId,
        source: t.source,
      },
    });
  } catch (err) {
    console.error(`[tasks] no se pudo emitir ${type}:`, err instanceof Error ? err.message : err);
  }
}

export async function emitPersonCreated(personId: string): Promise<void> {
  try {
    const p = await prisma.person.findUnique({ where: { id: personId }, select: { id: true, organizationId: true, name: true, email: true, phone: true, source: true } });
    if (!p) return;
    await emitDomainEvent({
      type: "person.created",
      account: null,
      organizationId: p.organizationId,
      contactId: null,
      chat: null,
      data: { personId: p.id, name: p.name, email: p.email, phone: p.phone, source: p.source },
    });
  } catch (err) {
    console.error("[people] no se pudo emitir person.created:", err instanceof Error ? err.message : err);
  }
}
