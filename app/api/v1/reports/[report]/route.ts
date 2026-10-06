import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors } from "@/lib/api/respond";
import { apiActor, crmCall } from "@/lib/api/deals";
import { REPORTS, isReportName } from "@/lib/crm/reports";

type Params = { params: Promise<{ report: string }> };

// GET /api/v1/reports/{summary|funnel|owners|origins|loss-reasons|trend|forecast}
// Filtros: pipelineId, from, to (YYYY-MM-DD o ISO; por defecto los últimos 90 días),
// ownerId, leadOrigin, adId, granularity. Son reportes de TODA la organización: una key
// limitada a ciertas cuentas no puede leerlos.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "reports:read");
  if (ctx.restricted) throw new ApiError(403, "forbidden", "Una API key limitada a ciertas cuentas no puede leer reportes de toda la organización");
  const { report } = await params;
  if (!isReportName(report)) throw new ApiError(404, "not_found", "Reporte no encontrado");
  return apiOk(await crmCall(() => REPORTS[report](apiActor(ctx), Object.fromEntries(new URL(req.url).searchParams))));
});
