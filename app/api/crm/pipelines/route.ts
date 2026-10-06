import { crmRoute, readJson } from "@/lib/crm/http";
import { createPipeline, listPipelines } from "@/lib/crm/pipelines";

// GET  /api/crm/pipelines — pipelines con sus etapas (y cuántos negocios tiene
//      cada una) + la moneda de la organización. `?archived=1` incluye archivados.
// POST /api/crm/pipelines — crea un pipeline con las etapas estándar (admin)
export const GET = crmRoute(async ({ req, actor }) =>
  listPipelines(actor, { includeArchived: new URL(req.url).searchParams.get("archived") === "1" })
);

export const POST = crmRoute(async ({ req, actor }) => Response.json(await createPipeline(actor, await readJson(req)), { status: 201 }));
