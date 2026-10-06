import { crmRoute, readJson } from "@/lib/crm/http";
import { createPerson, listPeople } from "@/lib/crm/people";
import { filtersFromParams, pageFromParams } from "@/lib/crm/schemas";

// GET  /api/crm/people — directorio de contactos (filtros: q, ownerId, companyId,
//      lifecycle, archived, channel, tagId, createdFrom/To, sort; page/pageSize)
// POST /api/crm/people — crea un contacto
export const GET = crmRoute(async ({ req, actor }) => {
  const params = new URL(req.url).searchParams;
  return listPeople(actor, filtersFromParams(params), pageFromParams(params));
});

export const POST = crmRoute(async ({ req, actor }) => {
  const person = await createPerson(actor, await readJson(req));
  return Response.json(person, { status: 201 });
});
