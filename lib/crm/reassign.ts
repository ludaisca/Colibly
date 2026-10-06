import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Al desactivar a un usuario, sus contactos y empresas activos no pueden
// quedarse con un responsable que ya no entra: hay que pasarlos a otro.

export async function countOwnedRecords(organizationId: string, userId: string) {
  const [people, companies, deals] = await Promise.all([
    prisma.person.count({ where: { organizationId, ownerId: userId, archivedAt: null } }),
    prisma.company.count({ where: { organizationId, ownerId: userId, archivedAt: null } }),
    prisma.deal.count({ where: { organizationId, ownerId: userId, status: "OPEN", archivedAt: null } }),
  ]);
  return { people, companies, deals };
}

export async function reassignOwnedRecords(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fromUserId: string,
  toUserId: string,
  actorId: string
): Promise<{ people: number; companies: number; deals: number }> {
  const [people, companies, deals] = await Promise.all([
    tx.person.findMany({ where: { organizationId, ownerId: fromUserId, archivedAt: null }, select: { id: true } }),
    tx.company.findMany({ where: { organizationId, ownerId: fromUserId, archivedAt: null }, select: { id: true } }),
    // Solo los negocios abiertos: los cerrados conservan a quien los cerró.
    tx.deal.findMany({ where: { organizationId, ownerId: fromUserId, status: "OPEN", archivedAt: null }, select: { id: true, personId: true } }),
  ]);
  if (deals.length) {
    await tx.deal.updateMany({ where: { id: { in: deals.map((d) => d.id) } }, data: { ownerId: toUserId, version: { increment: 1 } } });
    await tx.activityLog.createMany({
      data: deals.map((d) => ({ organizationId, actorId, type: "deal.owner_changed", personId: d.personId, data: { dealId: d.id, from: fromUserId, to: toUserId, reason: "user_disabled" } })),
    });
  }
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
  return { people: people.length, companies: companies.length, deals: deals.length };
}
