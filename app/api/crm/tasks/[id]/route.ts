import { crmRoute, readJson } from "@/lib/crm/http";
import { deleteTask, getTask, updateTask } from "@/lib/crm/tasks";

type P = { id: string };

// GET    — la tarea
// PATCH  — título, notas, tipo, fecha, aviso, responsable y `status` ("DONE" la completa,
//          "OPEN" la reabre; repetir el mismo estado no hace nada)
// DELETE — borra la tarea (el ejecutivo solo las que él creó)
export const GET = crmRoute<P>(async ({ actor, params }) => getTask(actor, params.id));
export const PATCH = crmRoute<P>(async ({ req, actor, params }) => updateTask(actor, params.id, await readJson(req)));
export const DELETE = crmRoute<P>(async ({ actor, params }) => deleteTask(actor, params.id));
