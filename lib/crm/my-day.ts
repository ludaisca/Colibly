import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { forbidden, notFound } from "@/lib/crm/errors";
import { isRestricted, type CrmActor } from "@/lib/crm/access";
import { dayBounds } from "@/lib/crm/task-rules";
import { serializeTask, taskSelect } from "@/lib/crm/tasks";

// "Mi día": lo que una persona tiene que atender hoy, en un solo lugar —
// tareas (atrasadas, de hoy, próximas, sin fecha), citas, conversaciones que
// esperan respuesta y negocios abiertos que se quedaron sin siguiente paso.
// "Hoy" es el día de la zona horaria de la organización. El admin/usuario puede
// ver el día de otro miembro (`userId`); el ejecutivo solo el suyo.

const TASK_CAP = 50;
const SIDE_CAP = 20;
const CHAT_CAP = 30;
const PAST_APPOINTMENT_DAYS = 14;
const UPCOMING_DAYS = 7;

interface WaitingChat {
  id: string;
  channel: string;
  accountId: string;
  accountName: string | null;
  name: string | null;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  personId: string | null;
}

// Conversaciones asignadas a la persona, abiertas, cuyo ÚLTIMO mensaje es del
// cliente (nadie ha contestado). Consulta cruda: Prisma no puede filtrar por la
// dirección del mensaje más reciente sin traer todos los mensajes.
async function waitingChats(organizationId: string, userId: string): Promise<WaitingChat[]> {
  const [wa, channel] = await Promise.all([
    prisma.$queryRaw<WaitingChat[]>(Prisma.sql`
      SELECT c.id, 'WHATSAPP' AS channel, c."accountId" AS "accountId", a.name AS "accountName",
             c.name, c."lastMessage", c."lastMessageAt", ct."personId" AS "personId"
      FROM wa_chats c
      JOIN wa_accounts a ON a.id = c."accountId" AND a.organization_id = ${organizationId}
      LEFT JOIN contacts ct ON ct.id = c."contactId"
      WHERE c."assignedToId" = ${userId}
        AND c.status IN ('OPEN', 'PENDING')
        AND c."isGroup" = false
        AND (SELECT m.direction FROM wa_messages m WHERE m."chatId" = c.id ORDER BY m.timestamp DESC LIMIT 1) = 'INBOUND'
      ORDER BY c."lastMessageAt" ASC NULLS LAST
      LIMIT ${CHAT_CAP}`),
    prisma.$queryRaw<WaitingChat[]>(Prisma.sql`
      SELECT c.id, a.channel::text AS channel, c."channelAccountId" AS "accountId", a.name AS "accountName",
             c.name, c."lastMessage", c."lastMessageAt", ct."personId" AS "personId"
      FROM conversations c
      JOIN channel_accounts a ON a.id = c."channelAccountId" AND a.organization_id = ${organizationId}
      LEFT JOIN contacts ct ON ct.id = c."contactId"
      WHERE c."assignedToId" = ${userId}
        AND c.status IN ('OPEN', 'PENDING')
        AND c."isGroup" = false
        AND (SELECT m.direction FROM channel_messages m WHERE m."conversationId" = c.id ORDER BY m.timestamp DESC LIMIT 1) = 'INBOUND'
      ORDER BY c."lastMessageAt" ASC NULLS LAST
      LIMIT ${CHAT_CAP}`),
  ]);
  return [...wa, ...channel]
    .sort((a, b) => (a.lastMessageAt?.getTime() ?? 0) - (b.lastMessageAt?.getTime() ?? 0))
    .slice(0, CHAT_CAP);
}

export async function getMyDay(actor: CrmActor, requestedUserId?: string | null) {
  let userId = actor.userId;
  if (requestedUserId && requestedUserId !== actor.userId) {
    if (isRestricted(actor)) throw forbidden("Solo puedes ver tu propio día");
    const member = await prisma.user.findFirst({ where: { id: requestedUserId, organizationId: actor.organizationId, disabledAt: null }, select: { id: true } });
    if (!member) throw notFound("Usuario");
    userId = member.id;
  }

  const now = new Date();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  const { start, end } = dayBounds(now, org.timezone);
  const weekEnd = new Date(end.getTime() + UPCOMING_DAYS * 86_400_000);
  const organizationId = actor.organizationId;

  const open = { organizationId, assigneeId: userId, status: "OPEN" as const };
  const orgContact = { person: { organizationId } };
  const appointmentBase = { assignedToId: userId, status: "SCHEDULED" as const, contact: orgContact };
  const apptSelect = {
    id: true,
    title: true,
    scheduledAt: true,
    durationMinutes: true,
    contact: { select: { id: true, name: true, realName: true, remoteJid: true, personId: true } },
  } satisfies Prisma.WAAppointmentSelect;
  const noNextStep: Prisma.DealWhereInput = {
    organizationId,
    ownerId: userId,
    status: "OPEN",
    archivedAt: null,
    tasks: { none: { status: "OPEN" } },
    OR: [{ contactId: null }, { contact: { appointments: { none: { status: "SCHEDULED", scheduledAt: { gte: now } } } } }],
  };

  const [overdue, overdueTotal, today, upcoming, undated, apptToday, apptPending, chats, stalled, stalledTotal] = await Promise.all([
    prisma.task.findMany({ where: { ...open, dueAt: { lt: start } }, orderBy: { dueAt: "asc" }, take: TASK_CAP, select: taskSelect }),
    prisma.task.count({ where: { ...open, dueAt: { lt: start } } }),
    prisma.task.findMany({ where: { ...open, dueAt: { gte: start, lt: end } }, orderBy: { dueAt: "asc" }, take: TASK_CAP, select: taskSelect }),
    prisma.task.findMany({ where: { ...open, dueAt: { gte: end, lt: weekEnd } }, orderBy: { dueAt: "asc" }, take: SIDE_CAP, select: taskSelect }),
    prisma.task.findMany({ where: { ...open, dueAt: null }, orderBy: { createdAt: "asc" }, take: SIDE_CAP, select: taskSelect }),
    prisma.wAAppointment.findMany({ where: { ...appointmentBase, scheduledAt: { gte: start, lt: end } }, orderBy: { scheduledAt: "asc" }, take: SIDE_CAP * 2, select: apptSelect }),
    // Citas de días anteriores que nadie marcó como cumplidas o canceladas.
    prisma.wAAppointment.findMany({
      where: { ...appointmentBase, scheduledAt: { gte: new Date(start.getTime() - PAST_APPOINTMENT_DAYS * 86_400_000), lt: start } },
      orderBy: { scheduledAt: "desc" },
      take: SIDE_CAP,
      select: apptSelect,
    }),
    waitingChats(organizationId, userId),
    prisma.deal.findMany({
      where: noNextStep,
      orderBy: { stageEnteredAt: "asc" },
      take: SIDE_CAP,
      select: { id: true, title: true, amount: true, stageEnteredAt: true, person: { select: { id: true, name: true } }, stage: { select: { id: true, name: true, color: true } } },
    }),
    prisma.deal.count({ where: noNextStep }),
  ]);

  const tasksToday = await prisma.task.count({ where: { ...open, dueAt: { gte: start, lt: end } } });
  const apptLabel = (a: (typeof apptToday)[number]) => ({ ...a, contactName: a.contact.realName ?? a.contact.name ?? a.contact.remoteJid });

  return {
    userId,
    timezone: org.timezone,
    now,
    day: { start, end },
    counts: {
      tasksOverdue: overdueTotal,
      tasksToday,
      appointmentsToday: apptToday.length,
      chatsWaiting: chats.length,
      dealsWithoutNextStep: stalledTotal,
    },
    tasks: {
      overdue: overdue.map((t) => serializeTask(t, now)),
      today: today.map((t) => serializeTask(t, now)),
      upcoming: upcoming.map((t) => serializeTask(t, now)),
      undated: undated.map((t) => serializeTask(t, now)),
    },
    appointments: { today: apptToday.map(apptLabel), pendingClose: apptPending.map(apptLabel) },
    chats: chats.map((c) => ({ ...c, waitingMinutes: c.lastMessageAt ? Math.max(0, Math.round((now.getTime() - c.lastMessageAt.getTime()) / 60_000)) : null })),
    dealsWithoutNextStep: stalled.map((d) => ({ ...d, amount: Number(d.amount) })),
  };
}
