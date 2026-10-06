import { crmRoute, readJson } from "@/lib/crm/http";
import { previewPeopleImport } from "@/lib/crm/import";

// Previsualiza una importación CSV sin escribir nada: { csv, mapping? }.
export const POST = crmRoute(async ({ req, actor }) => previewPeopleImport(actor, await readJson(req)));
