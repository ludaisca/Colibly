import { crmRoute, readJson } from "@/lib/crm/http";
import { moveDeal } from "@/lib/crm/deals";

// POST /api/crm/deals/{id}/move — { stageId, expectedVersion?, lostReasonId?, lostNote? }
// Es el único camino para cerrar un negocio: llevarlo a una etapa ganada lo gana;
// a una perdida lo pierde (exige `lostReasonId`). Dispara Meta CAPI, secuencias y eventos.
export const POST = crmRoute<{ id: string }>(async ({ req, actor, params }) => moveDeal(actor, params.id, await readJson(req)));
