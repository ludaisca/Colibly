import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, decodeCursor, encodeCursor, readPageParams, withApiErrors } from "@/lib/api/respond";
import { apiActor, crmCall } from "@/lib/api/deals";
import { API_TASK_SELECT, assertTaskTargetInScope, serializeApiTask, taskScopeWhere } from "@/lib/api/crm";
import { buildTaskWhere, createTask, taskFiltersSchema } from "@/lib/crm/tasks";

// GET /api/v1/tasks — tareas, más recientes primero (updatedAt), paginado por cursor.
// Filtros: status (open|done|all, por defecto open), assigneeId (id|none), personId,
// companyId, dealId, due (overdue|today|week|none), q, updatedSince.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "tasks:read");
  const url = new URL(req.url);
  const { limit, cursor } = readPageParams(url);
  const after = decodeCursor(cursor);

  const raw = Object.fromEntries(["status", "assigneeId", "personId", "companyId", "dealId", "due", "q"].flatMap((k) => (url.searchParams.get(k) ? [[k, url.searchParams.get(k)!]] : [])));
  const parsed = taskFiltersSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Filtros inválidos");

  const and: Prisma.TaskWhereInput[] = [await buildTaskWhere(apiActor(ctx), parsed.data), taskScopeWhere(ctx)];
  const updatedSince = url.searchParams.get("updatedSince");
  if (updatedSince) {
    const d = new Date(updatedSince);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, "invalid_request", "updatedSince debe ser una fecha ISO 8601");
    and.push({ updatedAt: { gte: d } });
  }
  if (after) and.push({ OR: [{ updatedAt: { lt: after.t } }, { updatedAt: after.t, id: { lt: after.id } }] });

  const rows = await prisma.task.findMany({ where: { AND: and }, select: API_TASK_SELECT, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: limit + 1 });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return apiOk({
    data: page.map(serializeApiTask),
    nextCursor: rows.length > limit && last ? encodeCursor({ t: last.updatedAt.toISOString(), id: last.id }) : null,
  });
});

const bodySchema = z.object({
  title: z.string().trim().min(1, "title es requerido").max(200),
  notes: z.string().nullable().optional(),
  kind: z.enum(["TODO", "CALL", "MESSAGE", "EMAIL", "MEETING"]).optional(),
  dueAt: z.string().nullable().optional(),
  // Minutos de aviso antes de dueAt; omitido = al llegar la hora; null = sin aviso.
  remindMinutesBefore: z.number().int().min(0).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  personId: z.string().min(1).nullable().optional(),
  companyId: z.string().min(1).nullable().optional(),
  dealId: z.string().min(1).nullable().optional(),
});

// POST /api/v1/tasks — crea una tarea ligada a una persona, empresa y/o negocio
// (al menos uno). Sin assigneeId queda a nombre del dueño de la key.
export const POST = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "tasks:write");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  await assertTaskTargetInScope(ctx, parsed.data);
  const created = await crmCall(() => createTask(apiActor(ctx), { ...parsed.data, source: "api" }));
  const row = await prisma.task.findUniqueOrThrow({ where: { id: created.id }, select: API_TASK_SELECT });
  return apiOk(serializeApiTask(row), 201);
});
