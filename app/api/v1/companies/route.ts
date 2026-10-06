import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, decodeCursor, encodeCursor, readPageParams, withApiErrors } from "@/lib/api/respond";
import { apiActor, crmCall } from "@/lib/api/deals";
import { assertUnrestricted, companyScopeWhere, companySelect, findScopedCompany, serializeCompany } from "@/lib/api/crm";
import { createCompany } from "@/lib/crm/companies";

// GET /api/v1/companies — empresas, más recientes primero (updatedAt), paginado por
// cursor. Filtros: q (nombre, dominio o industria), ownerId, archived (include), updatedSince.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "companies:read");
  const url = new URL(req.url);
  const { limit, cursor } = readPageParams(url);
  const after = decodeCursor(cursor);

  const and: Prisma.CompanyWhereInput[] = [companyScopeWhere(ctx)];
  const archived = url.searchParams.get("archived");
  if (archived === "only") and.push({ archivedAt: { not: null } });
  else if (archived !== "include") and.push({ archivedAt: null });
  const q = url.searchParams.get("q")?.trim();
  if (q) and.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { domain: { contains: q, mode: "insensitive" } }, { industry: { contains: q, mode: "insensitive" } }] });
  const ownerId = url.searchParams.get("ownerId");
  if (ownerId) and.push({ ownerId: ownerId === "none" ? null : ownerId });
  const updatedSince = url.searchParams.get("updatedSince");
  if (updatedSince) {
    const d = new Date(updatedSince);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, "invalid_request", "updatedSince debe ser una fecha ISO 8601");
    and.push({ updatedAt: { gte: d } });
  }
  if (after) and.push({ OR: [{ updatedAt: { lt: after.t } }, { updatedAt: after.t, id: { lt: after.id } }] });

  const rows = await prisma.company.findMany({ where: { AND: and }, select: companySelect, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: limit + 1 });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return apiOk({
    data: page.map(serializeCompany),
    nextCursor: rows.length > limit && last ? encodeCursor({ t: last.updatedAt.toISOString(), id: last.id }) : null,
  });
});

const bodySchema = z.object({
  name: z.string().trim().min(1, "name es requerido").max(200),
  domain: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
  allowDuplicate: z.boolean().optional(),
});

// POST /api/v1/companies — crea una empresa (409 si el nombre ya existe, salvo allowDuplicate).
export const POST = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "companies:write");
  assertUnrestricted(ctx, "crear empresas");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  const created = await crmCall(() => createCompany(apiActor(ctx), parsed.data));
  return apiOk(serializeCompany(await findScopedCompany(ctx, created.id)), 201);
});
