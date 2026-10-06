import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Al desactivar a un usuario, sus contactos y empresas activos no pueden
// quedarse con un responsable que ya no entra: hay que pasarlos a otro.

export async function countOwnedRecords(organizationId: string, userId: string) {
  const [people, companies] = await Promise.all([
    prisma.person.count({ where: { organizationId, ownerId: userId, archivedAt: null } }),
    prisma.company.count({ where: { organizationId, ownerId: userId, archivedAt: null } }),
  ]);
  return { people, companies };
}

export async function reassignOwnedRecords(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fromUserId: string,
  toUserId: string,
  actorId: string
): Promise<{ people: number; companies: number }> {
  const [people, companies] = await Promise.all([
    tx.person.findMany({ where: { organizationId, ownerId: fromUserId, archivedAt: null }, select: { id: true } }),
    tx.company.findMany({ where: { organizationId, ownerId: fromUserId, archivedAt: null }, select: { id: true } }),
  ]);
  if (people.length) {
    await tx.person.updateMany({ where: { id: { in: people.map((p) => p.id) } }, data: { ownerId: toUserId, version: { increment: 1 } } });
    await tx.activityLog.createMany({
      data: people.map((p) => ({ organizationId, actorId, type: "person.owner_changed", personId: p.id, data: { from: fromUserId, to: toUserId, reason: "user_disabled" } })),
    });
  }
  if (companies.length) {
    await tx.company.updateMany({ where: { id: { in: companies.map((c) => c.id) } }, data: { ownerId: toUserId, version: { increment: 1 } } });
    await tx.activityLog.createMany({
      data: companies.map((c) => ({ organizationId, actorId, type: "company.updated", companyId: c.id, data: { changes: { ownerId: [fromUserId, toUserId] }, reason: "user_disabled" } })),
    });
  }
  return { people: people.length, companies: companies.length };
}
