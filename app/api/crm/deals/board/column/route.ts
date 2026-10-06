import { crmRoute } from "@/lib/crm/http";
import { CrmError } from "@/lib/crm/errors";
import { listStageColumn } from "@/lib/crm/deals";
import { filtersFromParams } from "@/lib/crm/schemas";

// GET /api/crm/deals/board/column?stageId=&cursor=&limit= — siguiente página de una
// columna del tablero (mismos filtros que el tablero: ownerId, q).
export const GET = crmRoute(async ({ req, actor }) => {
  const params = new URL(req.url).searchParams;
  const stageId = params.get("stageId");
  if (!stageId) throw new CrmError(400, "invalid_request", "Falta stageId");
  const limit = Number(params.get("limit")) || 20;
  return listStageColumn(actor, stageId, filtersFromParams(params), params.get("cursor"), limit);
});
