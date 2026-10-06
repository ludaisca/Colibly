import { z } from "zod";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors } from "@/lib/api/respond";
import { apiActor, crmCall } from "@/lib/api/deals";
import { findScopedPerson, serializePerson } from "@/lib/api/crm";
import { updatePerson } from "@/lib/crm/people";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "people:read");
  const { id } = await params;
  return apiOk(serializePerson(await findScopedPerson(ctx, id)));
});

const patchSchema = z
  .object({
    // Concurrencia optimista: sin ella se usa la versión vigente.
    expectedVersion: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    jobTitle: z.string().nullable().optional(),
    companyId: z.string().min(1).nullable().optional(),
    ownerId: z.string().min(1).nullable().optional(),
    lifecycle: z.enum(["LEAD", "CUSTOMER"]).optional(),
    archived: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).some((k) => k !== "expectedVersion"), "Nada que actualizar");

// PATCH /api/v1/people/{id} — edita la persona (archived: true/false la archiva o restaura).
export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "people:write");
  const { id } = await params;
  const person = await findScopedPerson(ctx, id);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  await crmCall(() => updatePerson(apiActor(ctx), id, { ...parsed.data, expectedVersion: parsed.data.expectedVersion ?? person.version }));
  return apiOk(serializePerson(await findScopedPerson(ctx, id)));
});
