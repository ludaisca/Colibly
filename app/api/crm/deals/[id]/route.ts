import { crmRoute, readJson } from "@/lib/crm/http";
import { deleteDeal, getDealDetail, updateDeal } from "@/lib/crm/deals";

type P = { id: string };

// GET    — el negocio con su historial de etapas y la conversación ligada
// PATCH  — título, importe, probabilidad, cierre esperado, responsable, empresa,
//          canal, archivar; con `expectedVersion` (409 version_conflict si cambió)
// DELETE — borrado definitivo (solo admin)
export const GET = crmRoute<P>(async ({ actor, params }) => getDealDetail(actor, params.id));
export const PATCH = crmRoute<P>(async ({ req, actor, params }) => updateDeal(actor, params.id, await readJson(req)));
export const DELETE = crmRoute<P>(async ({ actor, params }) => deleteDeal(actor, params.id));
