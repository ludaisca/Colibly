import { crmRoute, readJson } from "@/lib/crm/http";
import { createCompany, listCompanies } from "@/lib/crm/companies";
import { filtersFromParams, pageFromParams } from "@/lib/crm/schemas";

export const GET = crmRoute(async ({ req, actor }) => {
  const params = new URL(req.url).searchParams;
  return listCompanies(actor, filtersFromParams(params), pageFromParams(params));
});

export const POST = crmRoute(async ({ req, actor }) => Response.json(await createCompany(actor, await readJson(req)), { status: 201 }));
