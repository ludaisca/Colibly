import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { forbidden, invalid, notFound } from "@/lib/crm/errors";
import { isRestricted, type CrmActor } from "@/lib/crm/access";
import { logActivity } from "@/lib/crm/activity";
import { validateOwner } from "@/lib/crm/people";
import { MAX_REMIND_MINUTES, computeRemindAt, dayBounds } from "@/lib/crm/task-rules";

// Servicio de TAREAS. Alcance: `organizationId`. Roles:
//  - admin / user: ven y editan todas las tareas de la organización.
//  - ejecutivo: ve las que tiene asignadas o que cuelgan de registros suyos
//    (persona, empresa o negocio de los que es responsable); edita y completa
//    solo las asignadas a él; crea solo sobre registros suyos y siempre
//    asignadas a sí mismo; no reasigna.

export const taskSelect = {
  id: true,
  title: true,
  notes: true,
  kind: true,
  status: true,
  dueAt: true,
  remindMinutesBefore: true,
  remindAt: true,
  remindedAt: true,
  completedAt: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  assigneeId: true,
  createdById: true,
  personId: true,
  companyId: true,
  dealId: true,
  assignee: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  person: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  deal: { select: { id: true, title: true, status: true } },
} satisfies Prisma.TaskSelect;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

export function serializeTask(row: TaskRow, now = new Date()) {
  return { ...row, overdue: row.status === "OPEN" && !!row.dueAt && row.dueAt < now };
}

// ── Alcance ─────────────────────────────────────────────────────────────────

export function taskVisibleWhere(actor: CrmActor): Prisma.TaskWhereInput {
  if (!isRestricted(actor)) return { organizationId: actor.organizationId };
  return {
    organizationId: actor.organizationId,
    OR: [{ assigneeId: actor.userId }, { person: { ownerId: actor.userId } }, { deal: { ownerId: actor.userId } }, { company: { ownerId: actor.userId } }],
  };
}

function assertCanEditTask(actor: CrmActor, task: { assigneeId: string | null }): void {
  if (isRestricted(actor) && task.assigneeId !== actor.userId) throw forbidden("Solo puedes editar las tareas que tienes asignadas");
}

async function loadTask(actor: CrmActor, id: string) {
  const task = await prisma.task.findFirst({ where: { id, ...taskVisibleWhere(actor) }, select: taskSelect });
  if (!task) throw notFound("Tarea");
  return task;
}

// ── Esquemas ────────────────────────────────────────────────────────────────

const dateTime = z.string().datetime({ offset: true, message: "Fecha inválida" });
const remindMinutes = z.number().int().min(0).max(MAX_REMIND_MINUTES).nullable();

const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "Indica qué hay que hacer").max(200),
  notes: z.string().trim().max(5000).nullable().optional(),
  kind: z.enum(["TODO", "CALL", "MESSAGE", "EMAIL", "MEETING"]).optional(),
  dueAt: dateTime.nullable().optional(),
  // Minutos de anticipación del aviso; sin indicar = al llegar la hora; null = sin aviso.
  remindMinutesBefore: remindMinutes.optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  personId: z.string().min(1).nullable().optional(),
  companyId: z.string().min(1).nullable().optional(),
  dealId: z.string().min(1).nullable().optional(),
  source: z.enum(["manual", "api", "automation"]).optional(),
});

const taskUpdateSchema = z.object({
  title: z.string().trim().min(1, "Indica qué hay que hacer").max(200).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  kind: z.enum(["TODO", "CALL", "MESSAGE", "EMAIL", "MEETING"]).optional(),
  dueAt: dateTime.nullable().optional(),
  remindMinutesBefore: remindMinutes.optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  status: z.enum(["OPEN", "DONE"]).optional(),
});

export const taskFiltersSchema = z.object({
  status: z.enum(["open", "done", "all"]).default("open"),
  // "me" = el actor, "none" = sin asignar.
  assigneeId: z.string().min(1).optional(),
  personId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  dealId: z.string().min(1).optional(),
  due: z.enum(["overdue", "today", "week", "none"]).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// ── Alta ────────────────────────────────────────────────────────────────────

async function resolveTarget(actor: CrmActor, input: z.infer<typeof taskCreateSchema>) {
  let personId = input.personId ?? null;
  const companyId = input.companyId ?? null;
  const dealId = input.dealId ?? null;
  if (!personId && !companyId && !dealId) throw invalid("Liga la tarea a un contacto, una empresa o un negocio");

  let owned = false;
  if (dealId) {
    const deal = await prisma.deal.findFirst({ where: { id: dealId, organizationId: actor.organizationId }, select: { personId: true, ownerId: true } });
    if (!deal) throw notFound("Negocio");
    // El ejecutivo no ve negocios ajenos, y tampoco puede colgarles tareas.
    if (isRestricted(actor) && deal.ownerId !== actor.userId) throw notFound("Negocio");
    if (personId && personId !== deal.personId) throw invalid("El negocio no pertenece a ese contacto");
    personId = deal.personId;
    owned = deal.ownerId === actor.userId;
  }
  if (personId) {
    const person = await prisma.person.findFirst({ where: { id: personId, organizationId: actor.organizationId }, select: { ownerId: true } });
    if (!person) throw notFound("Contacto");
    owned ||= person.ownerId === actor.userId;
  }
  if (companyId) {
    const company = await prisma.company.findFirst({ where: { id: companyId, organizationId: actor.organizationId }, select: { ownerId: true } });
    if (!company) throw notFound("Empresa");
    owned ||= company.ownerId === actor.userId;
  }
  if (isRestricted(actor) && !owned) throw forbidden("Solo puedes crear tareas sobre registros que tienes asignados");
  return { personId, companyId, dealId };
}

export async function createTask(actor: CrmActor, raw: unknown) {
  const input = taskCreateSchema.parse(raw);
  const target = await resolveTarget(actor, input);

  let assigneeId: string | null;
  if (isRestricted(actor)) assigneeId = actor.userId;
  else {
    assigneeId = input.assigneeId === undefined ? actor.userId : input.assigneeId;
    if (assigneeId) await validateOwner(actor.organizationId, assigneeId);
  }

  const now = new Date();
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  const minutes = input.remindMinutesBefore === undefined ? (dueAt ? 0 : null) : dueAt ? input.remindMinutesBefore : null;

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        organizationId: actor.organizationId,
        title: input.title,
        notes: input.notes?.trim() || null,
        kind: input.kind ?? "TODO",
        dueAt,
        remindMinutesBefore: minutes,
        remindAt: computeRemindAt(dueAt, minutes, now),
        assigneeId,
        createdById: actor.userId,
        personId: target.personId,
        companyId: target.companyId,
        dealId: target.dealId,
        source: input.source ?? "manual",
      },
      select: { id: true },
    });
    await logActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      type: "task.created",
      personId: target.personId,
      companyId: target.personId ? null : target.companyId,
      data: { taskId: created.id, title: input.title, ...(target.dealId ? { dealId: target.dealId } : {}), ...(dueAt ? { dueAt: dueAt.toISOString() } : {}), source: input.source ?? "manual" },
    });
    return tx.task.findUniqueOrThrow({ where: { id: created.id }, select: taskSelect });
  });

  await notifyAssigned(actor, task.assigneeId, task);
  return serializeTask(task);
}

async function notifyAssigned(actor: CrmActor, assigneeId: string | null, task: { id: string; title: string; person: { name: string } | null }) {
  if (!assigneeId || assigneeId === actor.userId) return;
  await prisma.notification
    .create({ data: { userId: assigneeId, type: "TASK_ASSIGNED", title: `Nueva tarea: ${task.title}`, body: task.person?.name ?? null, link: `/mi-dia?task=${task.id}` } })
    .catch((err) => console.error("[tasks] no se pudo notificar la asignación:", err));
}

// ── Edición, completar y borrar ─────────────────────────────────────────────

export async function updateTask(actor: CrmActor, id: string, raw: unknown) {
  const input = taskUpdateSchema.parse(raw);
  const task = await loadTask(actor, id);
  assertCanEditTask(actor, task);

  const now = new Date();
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.kind !== undefined) data.kind = input.kind;

  let assigneeChanged = false;
  if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
    if (isRestricted(actor)) throw forbidden("Solo un administrador o usuario puede reasignar tareas");
    if (input.assigneeId) await validateOwner(actor.organizationId, input.assigneeId);
    data.assigneeId = input.assigneeId;
    assigneeChanged = true;
  }

  // Fecha y aviso: si cambia cualquiera de los dos se recalcula el aviso y se
  // vuelve a armar (aunque ya hubiera avisado por la fecha anterior).
  const dueAt = input.dueAt === undefined ? task.dueAt : input.dueAt ? new Date(input.dueAt) : null;
  const minutes =
    input.remindMinutesBefore !== undefined ? (dueAt ? input.remindMinutesBefore : null) : dueAt ? (task.dueAt ? task.remindMinutesBefore : 0) : null;
  const reschedule = input.dueAt !== undefined || input.remindMinutesBefore !== undefined;
  if (reschedule) {
    data.dueAt = dueAt;
    data.remindMinutesBefore = minutes;
    data.remindAt = computeRemindAt(dueAt, minutes, now);
    data.remindedAt = null;
  }

  let transition: "completed" | "reopened" | null = null;
  if (input.status === "DONE" && task.status === "OPEN") {
    data.status = "DONE";
    data.completedAt = now;
    data.completedById = actor.userId;
    transition = "completed";
  } else if (input.status === "OPEN" && task.status === "DONE") {
    data.status = "OPEN";
    data.completedAt = null;
    data.completedById = null;
    // Al reabrirla el aviso vuelve a quedar armado si la hora aún no llega.
    data.remindAt = computeRemindAt(dueAt, minutes, now);
    data.remindedAt = null;
    transition = "reopened";
  }

  if (!Object.keys(data).length) return serializeTask(task, now);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data });
    if (transition) {
      await logActivity(tx, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: transition === "completed" ? "task.completed" : "task.reopened",
        personId: task.personId,
        companyId: task.personId ? null : task.companyId,
        data: { taskId: id, title: input.title ?? task.title, ...(task.dealId ? { dealId: task.dealId } : {}) },
      });
    }
    return tx.task.findUniqueOrThrow({ where: { id }, select: taskSelect });
  });

  if (assigneeChanged) await notifyAssigned(actor, updated.assigneeId, updated);
  return serializeTask(updated, now);
}

export async function deleteTask(actor: CrmActor, id: string) {
  const task = await prisma.task.findFirst({ where: { id, ...taskVisibleWhere(actor) }, select: { id: true, assigneeId: true, createdById: true } });
  if (!task) throw notFound("Tarea");
  // El ejecutivo solo borra lo que él mismo creó y le toca a él.
  if (isRestricted(actor) && !(task.assigneeId === actor.userId && task.createdById === actor.userId)) {
    throw forbidden("Solo puedes borrar las tareas que tú creaste");
  }
  await prisma.task.delete({ where: { id } });
  return { ok: true };
}

export async function getTask(actor: CrmActor, id: string) {
  return serializeTask(await loadTask(actor, id));
}

// ── Listado ─────────────────────────────────────────────────────────────────

export async function buildTaskWhere(actor: CrmActor, f: z.infer<typeof taskFiltersSchema>): Promise<Prisma.TaskWhereInput> {
  const and: Prisma.TaskWhereInput[] = [taskVisibleWhere(actor)];
  if (f.status !== "all") and.push({ status: f.status === "open" ? "OPEN" : "DONE" });
  if (f.assigneeId) and.push({ assigneeId: f.assigneeId === "me" ? actor.userId : f.assigneeId === "none" ? null : f.assigneeId });
  if (f.personId) and.push({ personId: f.personId });
  if (f.companyId) and.push({ companyId: f.companyId });
  if (f.dealId) and.push({ dealId: f.dealId });
  if (f.q) and.push({ title: { contains: f.q, mode: "insensitive" } });
  if (f.due) {
    if (f.due === "none") and.push({ dueAt: null });
    else {
      const org = await prisma.organization.findUnique({ where: { id: actor.organizationId }, select: { timezone: true } });
      const { start, end } = dayBounds(new Date(), org?.timezone ?? "UTC");
      if (f.due === "overdue") and.push({ dueAt: { lt: start } });
      else if (f.due === "today") and.push({ dueAt: { gte: start, lt: end } });
      else and.push({ dueAt: { gte: start, lt: new Date(end.getTime() + 6 * 86_400_000) } });
    }
  }
  return { AND: and };
}

export async function listTasks(actor: CrmActor, rawFilters: unknown) {
  const f = taskFiltersSchema.parse(rawFilters ?? {});
  const where = await buildTaskWhere(actor, f);
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    f.status === "done" ? [{ completedAt: "desc" }, { id: "desc" }] : [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }];
  const [total, rows] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({ where, orderBy, skip: (f.page - 1) * f.pageSize, take: f.pageSize, select: taskSelect }),
  ]);
  const now = new Date();
  return { items: rows.map((r) => serializeTask(r, now)), total, page: f.page, pageSize: f.pageSize };
}
