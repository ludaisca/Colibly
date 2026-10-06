import { crmRoute, readJson } from "@/lib/crm/http";
import { createStage } from "@/lib/crm/pipelines";

// POST /api/crm/pipelines/{id}/stages — agrega una etapa (admin)
export const POST = crmRoute<{ id: string }>(async ({ req, actor, params }) =>
  Response.json(await createStage(actor, params.id, await readJson(req)), { status: 201 })
);
