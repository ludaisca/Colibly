import { prisma } from "@/lib/prisma";
import { isOrgWritable } from "@/lib/billing/gates";

// Tick desatendido que avisa de las tareas del CRM cuando llega su hora de
// aviso (`remindAt`, ya calculado como fecha − anticipación al guardarla), así
// que la consulta es una desigualdad simple con índice. Una sola pasada por
// tarea: `remindedAt` evita repetirla, y reprogramar la tarea la vuelve a armar.
const CANDIDATE_POOL = 200;

export async function processTaskReminderTick() {
  const now = new Date();
  const due = await prisma.task.findMany({
    where: { status: "OPEN", remindedAt: null, remindAt: { not: null, lte: now }, assigneeId: { not: null } },
    orderBy: { remindAt: "asc" },
    take: CANDIDATE_POOL,
    select: {
      id: true,
      title: true,
      dueAt: true,
      organizationId: true,
      assigneeId: true,
      person: { select: { name: true } },
      company: { select: { name: true } },
      deal: { select: { title: true } },
    },
  });

  const writable = new Map<string, boolean>();
  for (const task of due) {
    try {
      if (!writable.has(task.organizationId)) writable.set(task.organizationId, await isOrgWritable(task.organizationId));
      // Una organización suspendida o en solo lectura no recibe avisos; el
      // pendiente queda armado para cuando vuelva.
      if (!writable.get(task.organizationId)) continue;

      // Reclama la tarea antes de notificar: si dos ticks se cruzan, solo uno avisa.
      const claimed = await prisma.task.updateMany({ where: { id: task.id, remindedAt: null }, data: { remindedAt: now } });
      if (claimed.count === 0) continue;

      const about = task.deal?.title ?? task.person?.name ?? task.company?.name ?? null;
      await prisma.notification.create({
        data: {
          userId: task.assigneeId!,
          type: "TASK_DUE",
          title: `Tarea pendiente: ${task.title}`,
          body: [about, task.dueAt ? task.dueAt.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : null].filter(Boolean).join(" — ") || null,
          link: `/mi-dia?task=${task.id}`,
        },
      });
    } catch (err) {
      console.error(`[task-reminders] Error avisando de la tarea ${task.id}:`, err);
    }
  }
}
