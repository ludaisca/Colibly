import { crmRoute, readJson } from "@/lib/crm/http";
import { reorderStages } from "@/lib/crm/pipelines";

// PUT /api/crm/pipelines/{id}/stages/reorder — { ids: [...] } con TODAS las etapas en el nuevo orden
export const PUT = crmRoute<{ id: string }>(async ({ req, actor, params }) => reorderStages(actor, params.id, await readJson(req)));
