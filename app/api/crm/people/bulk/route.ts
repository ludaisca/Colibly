import { crmRoute, readJson } from "@/lib/crm/http";
import { bulkPeople } from "@/lib/crm/people";

// Acciones en lote (máx. 200): assign_owner, archive, restore, set_company.
export const POST = crmRoute(async ({ req, actor }) => bulkPeople(actor, await readJson(req)));
