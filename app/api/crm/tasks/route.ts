import { crmRoute, readJson } from "@/lib/crm/http";
import { createTask, listTasks } from "@/lib/crm/tasks";

// GET  /api/crm/tasks — tareas (filtros: status=open|done|all, assigneeId=<id>|me|none, personId,
//      companyId, dealId, due=overdue|today|week|none, q; page/pageSize). El ejecutivo recibe
//      las asignadas a él o ligadas a registros suyos.
// POST /api/crm/tasks — crea una tarea ligada a un contacto, empresa y/o negocio
export const GET = crmRoute(async ({ req, actor }) => listTasks(actor, Object.fromEntries(new URL(req.url).searchParams)));

export const POST = crmRoute(async ({ req, actor }) => Response.json(await createTask(actor, await readJson(req)), { status: 201 }));
