import type { Prisma } from "@prisma/client";
import { logActivity } from "@/lib/crm/activity";
import { computeRemindAt, planStageTask } from "@/lib/crm/task-rules";

// Regla "al entrar a esta etapa, crear una tarea de seguimiento"
// (`PipelineStage.autoTaskTitle` / `autoTaskDueDays`). Se llama DENTRO de la
// transacción que mete el negocio a la etapa (alta, movimiento o alta
// automática desde una conversación), así que la tarea nace con el cambio o no
// nace. Es idempotente por entrada a la etapa (`autoKey`).

export interface StageTaskInput {
  organizationId: string;
  dealId: string;
  personId: string;
  dealTitle: string;
  // Responsable del negocio; si no tiene, el de la persona; si tampoco, queda sin asignar.
  ownerId: string | null;
  stageId: string;
  enteredAt: Date;
  actorId: string | null;
}

export async function createStageTask(tx: Prisma.TransactionClient, p: StageTaskInput): Promise<string | null> {
  const stage = await tx.pipelineStage.findUnique({ where: { id: p.stageId }, select: { autoTaskTitle: true, autoTaskDueDays: true } });
  if (!stage) return null;
  const plan = planStageTask(p.stageId, stage, p.enteredAt);
  if (!plan) return null;

  let assigneeId = p.ownerId;
  if (!assigneeId) {
    const person = await tx.person.findUnique({ where: { id: p.personId }, select: { ownerId: true } });
    assigneeId = person?.ownerId ?? null;
  }

  // `skipDuplicates` (ON CONFLICT DO NOTHING) en vez de capturar P2002: un error
  // de unicidad dentro de la transacción la dejaría abortada.
  const created = await tx.task.createMany({
    data: [
      {
        organizationId: p.organizationId,
        title: plan.title,
        kind: "TODO",
        dueAt: plan.dueAt,
        remindMinutesBefore: 0,
        remindAt: computeRemindAt(plan.dueAt, 0, new Date()),
        assigneeId,
        createdById: p.actorId,
        personId: p.personId,
        dealId: p.dealId,
        source: "stage_rule",
        autoKey: plan.autoKey,
      },
    ],
    skipDuplicates: true,
  });
  if (created.count === 0) return null;

  const task = await tx.task.findFirstOrThrow({ where: { dealId: p.dealId, autoKey: plan.autoKey }, select: { id: true } });
  await logActivity(tx, {
    organizationId: p.organizationId,
    actorId: p.actorId,
    type: "task.created",
    personId: p.personId,
    data: { taskId: task.id, title: plan.title, dealId: p.dealId, dealTitle: p.dealTitle, dueAt: plan.dueAt.toISOString(), source: "stage_rule" },
  });
  if (assigneeId && assigneeId !== p.actorId) {
    await tx.notification.create({
      data: {
        userId: assigneeId,
        type: "TASK_ASSIGNED",
        title: `Nueva tarea: ${plan.title}`,
        body: p.dealTitle,
        link: `/mi-dia?task=${task.id}`,
      },
    });
  }
  return task.id;
}
