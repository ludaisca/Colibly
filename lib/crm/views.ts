import { Prisma, type SavedViewEntity } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { forbidden, notFound } from "@/lib/crm/errors";
import { isRestricted, type CrmActor } from "@/lib/crm/access";
import { companyFiltersSchema, peopleFiltersSchema, viewSchema, viewUpdateSchema } from "@/lib/crm/schemas";

// Vistas guardadas de los listados (filtros + orden). Personales o compartidas
// con la organización; compartir es de admin/user. Solo su creador las edita,
// y un admin puede quitar una compartida.

const viewSelect = { id: true, entity: true, name: true, filters: true, shared: true, userId: true, createdAt: true, updatedAt: true } satisfies Prisma.SavedViewSelect;

function parseFilters(entity: SavedViewEntity, filters: unknown) {
  return (entity === "PEOPLE" ? peopleFiltersSchema : companyFiltersSchema).parse(filters) as Prisma.InputJsonObject;
}

export async function listViews(actor: CrmActor, entity: SavedViewEntity | null) {
  return prisma.savedView.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(entity ? { entity } : {}),
      OR: [{ userId: actor.userId }, { shared: true }],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: viewSelect,
  });
}

export async function createView(actor: CrmActor, raw: unknown) {
  const input = viewSchema.parse(raw);
  if (input.shared && isRestricted(actor)) throw forbidden("Tu rol no puede compartir vistas");
  return prisma.savedView.create({
    data: {
      organizationId: actor.organizationId,
      userId: actor.userId,
      entity: input.entity,
      name: input.name,
      filters: parseFilters(input.entity, input.filters),
      shared: input.shared ?? false,
    },
    select: viewSelect,
  });
}

async function loadEditable(actor: CrmActor, id: string) {
  const view = await prisma.savedView.findFirst({ where: { id, organizationId: actor.organizationId, OR: [{ userId: actor.userId }, { shared: true }] } });
  if (!view) throw notFound("Vista");
  const mine = view.userId === actor.userId;
  if (!mine && actor.role !== "admin") throw forbidden("Solo quien la creó (o un admin) puede cambiar esta vista");
  return view;
}

export async function updateView(actor: CrmActor, id: string, raw: unknown) {
  const input = viewUpdateSchema.parse(raw);
  const view = await loadEditable(actor, id);
  if (input.shared !== undefined && isRestricted(actor)) throw forbidden("Tu rol no puede compartir vistas");
  return prisma.savedView.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.shared !== undefined ? { shared: input.shared } : {}),
      ...(input.filters !== undefined ? { filters: parseFilters(view.entity, input.filters) } : {}),
    },
    select: viewSelect,
  });
}

export async function deleteView(actor: CrmActor, id: string) {
  await loadEditable(actor, id);
  await prisma.savedView.delete({ where: { id } });
  return { ok: true };
}
