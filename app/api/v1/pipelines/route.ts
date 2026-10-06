import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, withApiErrors } from "@/lib/api/respond";
import { apiActor, crmCall } from "@/lib/api/deals";
import { listLossReasons, listPipelines } from "@/lib/crm/pipelines";

// GET /api/v1/pipelines — pipelines con sus etapas (id, nombre, tipo abierta/
// ganada/perdida, probabilidad), los motivos de pérdida activos y la moneda de
// la organización. Los ids de aquí son los que piden POST/PATCH /api/v1/deals.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "deals:read");
  const actor = apiActor(ctx);
  const [pipelines, lossReasons] = await crmCall(() => Promise.all([listPipelines(actor), listLossReasons(actor)]));
  return apiOk({
    currency: pipelines.currency,
    pipelines: pipelines.items.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      stages: p.stages.map((s) => ({ id: s.id, name: s.name, position: s.position, type: s.outcome, probability: s.probability })),
    })),
    lossReasons: lossReasons.map((r) => ({ id: r.id, name: r.name })),
  });
});
