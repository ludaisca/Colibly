import { z } from "zod";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors } from "@/lib/api/respond";
import { apiActor, crmCall } from "@/lib/api/deals";
import { findScopedTask, serializeApiTask } from "@/lib/api/crm";
import { deleteTask, updateTask } from "@/lib/crm/tasks";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "tasks:read");
  const { id } = await params;
  return apiOk(serializeApiTask(await findScopedTask(ctx, id)));
});

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().nullable().optional(),
    kind: z.enum(["TODO", "CALL", "MESSAGE", "EMAIL", "MEETING"]).optional(),
    dueAt: z.string().nullable().optional(),
    remindMinutesBefore: z.number().int().min(0).nullable().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    // "DONE" la completa, "OPEN" la reabre (repetirlo no hace nada).
    status: z.enum(["OPEN", "DONE"]).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Nada que actualizar");

// PATCH /api/v1/tasks/{id} — edita, completa o reabre la tarea.
export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "tasks:write");
  const { id } = await params;
  await findScopedTask(ctx, id);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  await crmCall(() => updateTask(apiActor(ctx), id, parsed.data));
  return apiOk(serializeApiTask(await findScopedTask(ctx, id)));
});

export const DELETE = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "tasks:write");
  const { id } = await params;
  await findScopedTask(ctx, id);
  await crmCall(() => deleteTask(apiActor(ctx), id));
  return apiOk({ ok: true });
});
