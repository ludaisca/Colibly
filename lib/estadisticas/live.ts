import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { effectiveAvailability, type Availability } from "@/lib/users/availability";

// Panel en vivo (benchmark #10): foto de "ahora mismo" sobre las cuentas que
// el usuario ve. Sin websockets: la UI lo consulta cada 30 s con la pestaña
// visible. Activos = OPEN/PENDING sin posponer (mismo criterio que las vistas
// rápidas de la bandeja).

export interface LiveAgent {
  id: string;
  name: string;
  availability: Availability;
  openChats: number;
}

export interface LiveSnapshot {
  at: string;
  open: number;
  pending: number;
  unassigned: number;
  awaiting: number;
  /** Desde cuándo espera el chat más antiguo sin respuesta (ISO) o null. */
  oldestWaitingSince: string | null;
  agents: LiveAgent[];
}

const AVAILABILITY_ORDER: Record<Availability, number> = { ONLINE: 0, BUSY: 1, OFFLINE: 2 };

export async function getLiveSnapshot(userId: string, organizationId: string, now = new Date()): Promise<LiveSnapshot> {
  const [accountIds, channelAccountIds] = await Promise.all([getUserAccountIds(userId), getUserChannelAccountIds(userId)]);
  const notSnoozed = { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
  const wa = { accountId: { in: accountIds }, status: { in: ["OPEN" as const, "PENDING" as const] }, ...notSnoozed };
  const ch = { channelAccountId: { in: channelAccountIds }, status: { in: ["OPEN" as const, "PENDING" as const] }, ...notSnoozed };

  const [waByStatus, chByStatus, waUnassigned, chUnassigned, waWaiting, chWaiting, waLoad, chLoad, members] = await Promise.all([
    prisma.wAChat.groupBy({ by: ["status"], where: wa, _count: { _all: true } }),
    prisma.conversation.groupBy({ by: ["status"], where: ch, _count: { _all: true } }),
    prisma.wAChat.count({ where: { ...wa, assignedToId: null } }),
    prisma.conversation.count({ where: { ...ch, assignedToId: null } }),
    prisma.wAChat.aggregate({ where: { ...wa, waitingSince: { not: null } }, _count: { _all: true }, _min: { waitingSince: true } }),
    prisma.conversation.aggregate({ where: { ...ch, waitingSince: { not: null } }, _count: { _all: true }, _min: { waitingSince: true } }),
    prisma.wAChat.groupBy({ by: ["assignedToId"], where: { ...wa, assignedToId: { not: null } }, _count: { _all: true } }),
    prisma.conversation.groupBy({ by: ["assignedToId"], where: { ...ch, assignedToId: { not: null } }, _count: { _all: true } }),
    prisma.user.findMany({
      where: { organizationId, disabledAt: null },
      select: { id: true, name: true, email: true, availability: true, lastSeenAt: true },
    }),
  ]);

  const statusCount = (status: "OPEN" | "PENDING") =>
    (waByStatus.find((row) => row.status === status)?._count._all ?? 0) +
    (chByStatus.find((row) => row.status === status)?._count._all ?? 0);

  const load = new Map<string, number>();
  for (const row of [...waLoad, ...chLoad]) {
    if (row.assignedToId) load.set(row.assignedToId, (load.get(row.assignedToId) ?? 0) + row._count._all);
  }

  const oldest = [waWaiting._min.waitingSince, chWaiting._min.waitingSince]
    .filter((date): date is Date => !!date)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const agents: LiveAgent[] = members
    .map((member) => ({
      id: member.id,
      name: member.name ?? member.email ?? "Usuario",
      availability: effectiveAvailability(member, now.getTime()),
      openChats: load.get(member.id) ?? 0,
    }))
    .sort((a, b) => AVAILABILITY_ORDER[a.availability] - AVAILABILITY_ORDER[b.availability] || b.openChats - a.openChats || a.name.localeCompare(b.name, "es"));

  return {
    at: now.toISOString(),
    open: statusCount("OPEN"),
    pending: statusCount("PENDING"),
    unassigned: waUnassigned + chUnassigned,
    awaiting: waWaiting._count._all + chWaiting._count._all,
    oldestWaitingSince: oldest?.toISOString() ?? null,
    agents,
  };
}
