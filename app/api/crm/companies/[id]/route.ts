import { crmRoute, readJson } from "@/lib/crm/http";
import { deleteCompany, getCompanyDetail, updateCompany } from "@/lib/crm/companies";

type P = { id: string };

export const GET = crmRoute<P>(async ({ actor, params }) => getCompanyDetail(actor, params.id));
export const PATCH = crmRoute<P>(async ({ req, actor, params }) => updateCompany(actor, params.id, await readJson(req)));
// Borrado definitivo (solo admin); sus contactos quedan sin empresa.
export const DELETE = crmRoute<P>(async ({ actor, params }) => deleteCompany(actor, params.id));
