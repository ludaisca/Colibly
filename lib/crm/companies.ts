import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CrmError, notFound, versionConflict } from "@/lib/crm/errors";
import { assertCanEdit, isRestricted, requireRoles, type CrmActor } from "@/lib/crm/access";
import { logActivity } from "@/lib/crm/activity";
import { cleanText } from "@/lib/crm/normalize";
import { diffFields } from "@/lib/crm/merge-fields";
import { validateOwner } from "@/lib/crm/people";
import { companyCreateSchema, companyFiltersSchema, companyUpdateSchema } from "@/lib/crm/schemas";

// Servicio de EMPRESAS (B2B, opcionales). Mismo modelo de permisos que las
// personas: directorio compartido; el ejecutivo solo edita las que tiene asignadas.

const companyRowSelect = {
  id: true,
  name: true,
  domain: true,
  industry: true,
  size: true,
  location: true,
  notes: true,
  ownerId: true,
  owner: { select: { id: true, name: true } },
  version: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanySelect;

async function loadCompany(organizationId: string, id: string) {
  const c = await prisma.company.findFirst({ where: { id, organizationId } });
  if (!c) throw notFound("Empresa");
  return c;
}

export async function findCompanyByName(organizationId: string, name: string) {
  return prisma.company.findFirst({
    where: { organizationId, archivedAt: null, name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
}

export async function createCompany(actor: CrmActor, raw: unknown) {
  const input = companyCreateSchema.parse(raw);
  const ownerId = isRestricted(actor) ? actor.userId : input.ownerId ?? null;
  if (ownerId) await validateOwner(actor.organizationId, ownerId);
  if (!input.allowDuplicate) {
    const same = await findCompanyByName(actor.organizationId, input.name);
    if (same) throw new CrmError(409, "duplicate_company", "Ya existe una empresa con ese nombre", { matches: [same] });
  }
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        domain: cleanText(input.domain)?.toLowerCase() ?? null,
        industry: cleanText(input.industry, 120),
        size: cleanText(input.size, 60),
        location: cleanText(input.location),
        notes: cleanText(input.notes, 5000),
        ownerId,
      },
      select: companyRowSelect,
    });
    await logActivity(tx, { organizationId: actor.organizationId, actorId: actor.userId, type: "company.created", companyId: company.id });
    return company;
  });
}

const EDITABLE = ["name", "domain", "industry", "size", "location", "notes"] as const;

export async function updateCompany(actor: CrmActor, id: string, raw: unknown) {
  const input = companyUpdateSchema.parse(raw);
  const company = await loadCompany(actor.organizationId, id);
  assertCanEdit(actor, company);

  const patch: Partial<Record<(typeof EDITABLE)[number], unknown>> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.domain !== undefined) patch.domain = cleanText(input.domain)?.toLowerCase() ?? null;
  if (input.industry !== undefined) patch.industry = cleanText(input.industry, 120);
  if (input.size !== undefined) patch.size = cleanText(input.size, 60);
  if (input.location !== undefined) patch.location = cleanText(input.location);
  if (input.notes !== undefined) patch.notes = cleanText(input.notes, 5000);
  const data: Prisma.CompanyUncheckedUpdateInput = {};
  Object.assign(data, patch);

  const ownerChanged = input.ownerId !== undefined && input.ownerId !== company.ownerId;
  if (ownerChanged) {
    requireRoles(actor, ["admin", "user"]);
    if (input.ownerId) await validateOwner(actor.organizationId, input.ownerId);
    data.ownerId = input.ownerId;
  }
  const archiveChanged = input.archived !== undefined && input.archived !== !!company.archivedAt;
  if (archiveChanged) {
    requireRoles(actor, ["admin", "user"]);
    data.archivedAt = input.archived ? new Date() : null;
  }

  const changes = diffFields(company as unknown as Record<string, unknown>, patch, EDITABLE);
  if (!Object.keys(changes).length && !ownerChanged && !archiveChanged) {
    return prisma.company.findUniqueOrThrow({ where: { id }, select: companyRowSelect });
  }
  return prisma.$transaction(async (tx) => {
    const res = await tx.company.updateMany({
      where: { id, organizationId: actor.organizationId, version: input.expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (res.count === 0) throw versionConflict(await tx.company.findUnique({ where: { id }, select: companyRowSelect }));
    const base = { organizationId: actor.organizationId, actorId: actor.userId, companyId: id };
    if (Object.keys(changes).length) await logActivity(tx, { ...base, type: "company.updated", data: { changes } as Prisma.InputJsonValue });
    if (ownerChanged) await logActivity(tx, { ...base, type: "company.updated", data: { changes: { ownerId: [company.ownerId, input.ownerId ?? null] } } });
    if (archiveChanged) await logActivity(tx, { ...base, type: input.archived ? "company.archived" : "company.restored" });
    return tx.company.findUniqueOrThrow({ where: { id }, select: companyRowSelect });
  });
}

// Borrado definitivo: solo admin. Sus contactos NO se borran: quedan sin empresa.
export async function deleteCompany(actor: CrmActor, id: string) {
  requireRoles(actor, ["admin"]);
  const company = await loadCompany(actor.organizationId, id);
  await prisma.company.delete({ where: { id: company.id } });
  return { ok: true };
}

export async function listCompanies(actor: CrmActor, rawFilters: unknown, page: { page: number; pageSize: number }) {
  const f = companyFiltersSchema.parse(rawFilters);
  const and: Prisma.CompanyWhereInput[] = [{ organizationId: actor.organizationId }];
  if (f.archived === "only") and.push({ archivedAt: { not: null } });
  else if (f.archived !== "include") and.push({ archivedAt: null });
  if (f.q) {
    and.push({ OR: [{ name: { contains: f.q, mode: "insensitive" } }, { domain: { contains: f.q, mode: "insensitive" } }, { industry: { contains: f.q, mode: "insensitive" } }] });
  }
  if (f.ownerId === "none") and.push({ ownerId: null });
  else if (f.ownerId === "me") and.push({ ownerId: actor.userId });
  else if (f.ownerId) and.push({ ownerId: f.ownerId });
  const where: Prisma.CompanyWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    prisma.company.findMany({
      where,
      select: { ...companyRowSelect, _count: { select: { people: { where: { archivedAt: null } } } } },
      orderBy: f.sort === "name" ? [{ name: "asc" }, { id: "asc" }] : [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    }),
    prisma.company.count({ where }),
  ]);
  return { items: rows.map(({ _count, ...c }) => ({ ...c, peopleCount: _count.people })), total, page: page.page, pageSize: page.pageSize };
}

export async function getCompanyDetail(actor: CrmActor, id: string) {
  const company = await prisma.company.findFirst({ where: { id, organizationId: actor.organizationId }, select: companyRowSelect });
  if (!company) throw notFound("Empresa");
  const [people, activity] = await Promise.all([
    prisma.person.findMany({
      where: { organizationId: actor.organizationId, companyId: id, archivedAt: null },
      orderBy: { name: "asc" },
      take: 200,
      select: { id: true, name: true, email: true, phone: true, jobTitle: true, lifecycle: true, ownerId: true },
    }),
    prisma.activityLog.findMany({
      where: { organizationId: actor.organizationId, companyId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { id: true, type: true, data: true, createdAt: true, actor: { select: { id: true, name: true } } },
    }),
  ]);
  return { ...company, canEdit: !isRestricted(actor) || company.ownerId === actor.userId, people, activity };
}
