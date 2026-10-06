import { z } from "zod";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors } from "@/lib/api/respond";
import { apiActor, crmCall } from "@/lib/api/deals";
import { findScopedCompany, serializeCompany } from "@/lib/api/crm";
import { updateCompany } from "@/lib/crm/companies";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "companies:read");
  const { id } = await params;
  return apiOk(serializeCompany(await findScopedCompany(ctx, id)));
});

const patchSchema = z
  .object({
    expectedVersion: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    domain: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    size: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    ownerId: z.string().min(1).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).some((k) => k !== "expectedVersion"), "Nada que actualizar");

// PATCH /api/v1/companies/{id} — edita la empresa (archived: true/false la archiva o restaura).
export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "companies:write");
  const { id } = await params;
  const company = await findScopedCompany(ctx, id);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  await crmCall(() => updateCompany(apiActor(ctx), id, { ...parsed.data, expectedVersion: parsed.data.expectedVersion ?? company.version }));
  return apiOk(serializeCompany(await findScopedCompany(ctx, id)));
});
