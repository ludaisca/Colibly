import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, decodeCursor, encodeCursor, readPageParams, withApiErrors } from "@/lib/api/respond";
import { apiActor, crmCall } from "@/lib/api/deals";
import { assertUnrestricted, findScopedPerson, personScopeWhere, personSelect, serializePerson } from "@/lib/api/crm";
import { buildPeopleWhere, createPerson } from "@/lib/crm/people";
import { peopleFiltersSchema } from "@/lib/crm/schemas";

// GET /api/v1/people — personas (los "Contactos" del CRM), más recientes primero
// (updatedAt), paginado por cursor. Filtros: q, ownerId, companyId, lifecycle
// (LEAD|CUSTOMER), archived (exclude|only|include), updatedSince.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "people:read");
  const url = new URL(req.url);
  const { limit, cursor } = readPageParams(url);
  const after = decodeCursor(cursor);

  const raw = Object.fromEntries(["q", "ownerId", "companyId", "lifecycle", "archived"].flatMap((k) => (url.searchParams.get(k) ? [[k, url.searchParams.get(k)!]] : [])));
  const parsed = peopleFiltersSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Filtros inválidos");

  const and: Prisma.PersonWhereInput[] = [await buildPeopleWhere(apiActor(ctx), parsed.data), personScopeWhere(ctx)];
  const updatedSince = url.searchParams.get("updatedSince");
  if (updatedSince) {
    const d = new Date(updatedSince);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, "invalid_request", "updatedSince debe ser una fecha ISO 8601");
    and.push({ updatedAt: { gte: d } });
  }
  if (after) and.push({ OR: [{ updatedAt: { lt: after.t } }, { updatedAt: after.t, id: { lt: after.id } }] });

  const rows = await prisma.person.findMany({ where: { AND: and }, select: personSelect(ctx), orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: limit + 1 });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return apiOk({
    data: page.map(serializePerson),
    nextCursor: rows.length > limit && last ? encodeCursor({ t: last.updatedAt.toISOString(), id: last.id }) : null,
  });
});

const bodySchema = z.object({
  name: z.string().trim().min(1, "name es requerido").max(200),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  companyId: z.string().min(1).nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
  lifecycle: z.enum(["LEAD", "CUSTOMER"]).optional(),
  // Crear aunque ya exista alguien con ese correo o teléfono.
  allowDuplicate: z.boolean().optional(),
});

// POST /api/v1/people — crea una persona (sin canal). Un correo o teléfono ya
// usado responde 409 (conflict) salvo `allowDuplicate`. Cuenta para el límite
// de contactos del plan. Las keys limitadas a cuentas no pueden crear personas.
export const POST = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "people:write");
  assertUnrestricted(ctx, "crear personas");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  const created = await crmCall(() => createPerson(apiActor(ctx), parsed.data, { source: "api" }));
  return apiOk(serializePerson(await findScopedPerson(ctx, created.id)), 201);
});
