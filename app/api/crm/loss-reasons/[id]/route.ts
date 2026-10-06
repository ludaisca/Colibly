import { crmRoute, readJson } from "@/lib/crm/http";
import { updateLossReason } from "@/lib/crm/pipelines";

// PATCH — renombrar, reordenar o archivar un motivo (admin)
export const PATCH = crmRoute<{ id: string }>(async ({ req, actor, params }) => updateLossReason(actor, params.id, await readJson(req)));
