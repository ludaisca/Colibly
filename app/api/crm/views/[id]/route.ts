import { crmRoute, readJson } from "@/lib/crm/http";
import { deleteView, updateView } from "@/lib/crm/views";

type P = { id: string };
export const PATCH = crmRoute<P>(async ({ req, actor, params }) => updateView(actor, params.id, await readJson(req)));
export const DELETE = crmRoute<P>(async ({ actor, params }) => deleteView(actor, params.id));
