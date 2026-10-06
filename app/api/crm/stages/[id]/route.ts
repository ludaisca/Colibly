import { crmRoute, readJson } from "@/lib/crm/http";
import { deleteStage, updateStage } from "@/lib/crm/pipelines";

type P = { id: string };

// PATCH  — nombre, color, tipo (abierta/ganada/perdida), probabilidad, evento de Meta (admin)
// DELETE — `?moveTo=<etapaId>` si la etapa tiene negocios: se mueven a esa etapa
export const PATCH = crmRoute<P>(async ({ req, actor, params }) => updateStage(actor, params.id, await readJson(req)));
export const DELETE = crmRoute<P>(async ({ req, actor, params }) => deleteStage(actor, params.id, new URL(req.url).searchParams.get("moveTo")));
