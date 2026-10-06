import { crmRoute, readJson } from "@/lib/crm/http";
import { deletePipeline, updatePipeline } from "@/lib/crm/pipelines";

type P = { id: string };

// PATCH  — nombre, predeterminado, alta automática de negocios, archivar (admin)
// DELETE — solo si no tiene negocios (si los tiene, se archiva)
export const PATCH = crmRoute<P>(async ({ req, actor, params }) => updatePipeline(actor, params.id, await readJson(req)));
export const DELETE = crmRoute<P>(async ({ actor, params }) => deletePipeline(actor, params.id));
