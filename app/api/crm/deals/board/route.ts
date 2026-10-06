import { crmRoute } from "@/lib/crm/http";
import { getBoard } from "@/lib/crm/deals";
import { filtersFromParams } from "@/lib/crm/schemas";

// GET /api/crm/deals/board?pipelineId=&ownerId=&q= — el tablero: una columna por
// etapa con su total (cuántos, importe, ponderado) y la primera página de
// tarjetas; el resto de cada columna con /deals/board/column.
export const GET = crmRoute(async ({ req, actor }) => getBoard(actor, filtersFromParams(new URL(req.url).searchParams)));
