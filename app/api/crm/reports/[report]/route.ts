import { crmRoute } from "@/lib/crm/http";
import { notFound } from "@/lib/crm/errors";
import { REPORTS, isReportName } from "@/lib/crm/reports";

type P = { report: string };

// GET /api/crm/reports/{summary|funnel|owners|origins|loss-reasons|trend|forecast}
// Filtros: pipelineId, from, to (YYYY-MM-DD en la zona de la organización o ISO; por defecto
// los últimos 90 días), ownerId (id|none|me), leadOrigin, adId, granularity (solo trend).
// Solo lectura. El ejecutivo solo recibe sus propios negocios.
export const GET = crmRoute<P>(async ({ req, actor, params }) => {
  if (!isReportName(params.report)) throw notFound("Reporte");
  return REPORTS[params.report](actor, Object.fromEntries(new URL(req.url).searchParams));
});
