import { z } from "zod";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors } from "@/lib/api/respond";
import { apiActor, crmCall, findScopedDeal, serializeApiDeal } from "@/lib/api/deals";
import { moveDeal, updateDeal } from "@/lib/crm/deals";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "deals:read");
  const { id } = await params;
  return apiOk(serializeApiDeal(await findScopedDeal(ctx, id)));
});

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    amount: z.number().min(0).optional(),
    probability: z.number().int().min(0).max(100).nullable().optional(),
    expectedCloseDate: z.string().nullable().optional(),
    // Mover de etapa: ganar/perder se hace llevándolo a una etapa de ese tipo
    // (perder exige lostReasonId, ver GET /api/v1/pipelines).
    stageId: z.string().min(1).optional(),
    lostReasonId: z.string().min(1).nullable().optional(),
    lostNote: z.string().max(500).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Nada que actualizar");

// PATCH /api/v1/deals/{id} — edita el negocio y/o lo mueve de etapa. Un cambio
// de etapa dispara lo mismo que moverlo en el tablero: Meta CAPI para leads de
// anuncios, secuencias y los webhooks deal.stage_changed / deal.won / deal.lost.
export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "deals:write");
  const { id } = await params;
  const deal = await findScopedDeal(ctx, id);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  const { stageId, lostReasonId, lostNote, ...fields } = parsed.data;
  const actor = apiActor(ctx);

  let version = deal.version;
  if (Object.keys(fields).length > 0) {
    const updated = await crmCall(() => updateDeal(actor, id, { ...fields, expectedVersion: version }));
    version = updated.version;
  }
  if (stageId) {
    return apiOk(await crmCall(() => moveDeal(actor, id, { stageId, lostReasonId, lostNote, expectedVersion: version })));
  }
  return apiOk(serializeApiDeal(await findScopedDeal(ctx, id)));
});
