import { crmRoute, readJson } from "@/lib/crm/http";
import { createDeal, listDeals } from "@/lib/crm/deals";
import { filtersFromParams, pageFromParams } from "@/lib/crm/schemas";

// GET  /api/crm/deals — negocios (filtros: q, pipelineId, stageId, status, ownerId,
//      personId, companyId, leadOrigin, adId, archived, createdFrom/To, closedFrom/To,
//      sort; page/pageSize). El ejecutivo solo recibe los suyos.
// POST /api/crm/deals — abre un negocio de un contacto (`personId`)
export const GET = crmRoute(async ({ req, actor }) => {
  const params = new URL(req.url).searchParams;
  return listDeals(actor, filtersFromParams(params), pageFromParams(params));
});

export const POST = crmRoute(async ({ req, actor }) => Response.json(await createDeal(actor, await readJson(req)), { status: 201 }));
