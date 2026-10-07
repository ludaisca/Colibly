import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isRestricted, type CrmActor } from "@/lib/crm/access";
import { taskVisibleWhere } from "@/lib/crm/task-scope";

// El historial de una persona es compartido, pero habla de negocios y tareas
// que un ejecutivo no puede ver (títulos, etapas). Para él solo se muestran las
// entradas de negocios y tareas que SÍ le tocan; todo lo demás (altas, ediciones
// del contacto, fusiones…) se ve igual que para el resto.
export async function activityVisibleWhere(actor: CrmActor, personId: string): Promise<Prisma.ActivityLogWhereInput> {
  if (!isRestricted(actor)) return {};
  const [deals, tasks] = await Promise.all([
    prisma.deal.findMany({ where: { organizationId: actor.organizationId, personId, ownerId: actor.userId }, select: { id: true } }),
    prisma.task.findMany({ where: { AND: [{ personId }, taskVisibleWhere(actor)] }, select: { id: true } }),
  ]);
  return {
    OR: [
      { NOT: { OR: [{ type: { startsWith: "deal." } }, { type: { startsWith: "task." } }] } },
      ...deals.map((d) => ({ data: { path: ["dealId"], equals: d.id } })),
      ...tasks.map((t) => ({ data: { path: ["taskId"], equals: t.id } })),
    ],
  };
}
