import type { Prisma } from "@prisma/client";

// Historial CRM. Se escribe con el mismo cliente de transacción que el cambio
// que describe, así que nunca queda un cambio sin su rastro (ni al revés).
export type ActivityType =
  | "person.created"
  | "person.updated"
  | "person.owner_changed"
  | "person.archived"
  | "person.restored"
  | "person.merged"
  | "person.channel_linked"
  | "company.created"
  | "company.updated"
  | "company.archived"
  | "company.restored";

export interface ActivityInput {
  organizationId: string;
  actorId: string | null;
  type: ActivityType;
  personId?: string | null;
  companyId?: string | null;
  data?: Prisma.InputJsonValue;
}

export async function logActivity(tx: Prisma.TransactionClient, a: ActivityInput): Promise<void> {
  await tx.activityLog.create({
    data: {
      organizationId: a.organizationId,
      actorId: a.actorId,
      type: a.type,
      personId: a.personId ?? null,
      companyId: a.companyId ?? null,
      data: a.data,
    },
  });
}
