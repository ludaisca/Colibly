import { displayName } from "@/lib/chats/display-name";
import type { Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { addDaysKey, safeTimeZone, zonedDayKey, zonedDayStart } from "@/lib/dates/zoned";

const DEFAULT_TZ = "America/Mexico_City";
const MAX_RANGE_DAYS = 90;
const DEFAULT_RANGE_DAYS = 30;

// El enum Channel de Prisma solo cubre los canales genéricos; WhatsApp vive en
// sus propias tablas. El reporte los unifica en un solo tipo.
export type ReportChannel = Channel | "WHATSAPP";

export interface ReportChat {
  id: string;
  contactName: string;
  remoteJid: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  channel: ReportChannel;
  accountName: string;
}

export interface AgentReport {
  userId: string;
  userName: string;
  email: string | null;
  newChats: number;
  resolved: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  chats: ReportChat[];
}

export interface ChannelReport {
  channel: ReportChannel;
  newChats: number;
  resolved: number;
}

export interface RangeReport {
  from: string;
  to: string;
  totals: {
    newChats: number;
    resolved: number;
    open: number;
    unassigned: number;
    messages: number;
    avgFirstResponseMinutes: number | null;
    avgResolutionMinutes: number | null;
    csatSent: number;
    csatResponses: number;
    csatAvg: number | null;
    /** Ventas del periodo (LeadOutcomeEvent, valor congelado al cambiar de resultado). */
    wonCount: number;
    wonValueCents: number;
    lostCount: number;
    lostValueCents: number;
  };
  agents: AgentReport[];
  channels: ChannelReport[];
}

export interface ParsedRange {
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
}

// Acepta ?from=YYYY-MM-DD&to=YYYY-MM-DD; si falta o es inválido, usa los
// últimos 30 días. El `to` es inclusivo y se convierte en un límite exclusivo
// al inicio del día siguiente para no perder los mensajes de la última noche.
// Los días se cortan en la zona horaria de la organización (Organization.timezone).
export function parseReportRange(fromParam?: string, toParam?: string, timeZone: string = DEFAULT_TZ): ParsedRange {
  const tz = safeTimeZone(timeZone, DEFAULT_TZ);
  const startOf = (key: string) => zonedDayStart(key, tz);
  const endOf = (key: string) => zonedDayStart(addDaysKey(key, 1), tz);
  const isKey = (value?: string) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");

  const today = zonedDayKey(new Date(), tz);
  let toKey = isKey(toParam) ? toParam! : today;
  let fromKey = isKey(fromParam) ? fromParam! : addDaysKey(toKey, -(DEFAULT_RANGE_DAYS - 1));

  let from = startOf(fromKey);
  let toExclusive = endOf(toKey);

  if (Number.isNaN(from.getTime()) || Number.isNaN(toExclusive.getTime()) || from >= toExclusive) {
    toKey = today;
    fromKey = addDaysKey(today, -(DEFAULT_RANGE_DAYS - 1));
    from = startOf(fromKey);
    toExclusive = endOf(toKey);
  }

  const maxFrom = startOf(addDaysKey(toKey, -(MAX_RANGE_DAYS - 1)));
  if (from < maxFrom) {
    fromKey = addDaysKey(toKey, -(MAX_RANGE_DAYS - 1));
    from = startOf(fromKey);
  }

  return { from, to: toExclusive, fromKey, toKey };
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function minutesBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 60000;
}

const WA_SELECT = {
  id: true,
  remoteJid: true,
  status: true,
  assignedToId: true,
  assignedTo: { select: { name: true, email: true } },
  createdAt: true,
  firstResponseAt: true,
  resolvedAt: true,
  contact: { select: { name: true } },
  account: { select: { name: true } },
} as const;

const CHANNEL_SELECT = {
  id: true,
  externalId: true,
  status: true,
  assignedToId: true,
  assignedTo: { select: { name: true, email: true } },
  createdAt: true,
  firstResponseAt: true,
  resolvedAt: true,
  contact: { select: { name: true } },
  channelAccount: { select: { name: true, channel: true } },
} as const;

export async function getRangeReport(userId: string, range: ParsedRange): Promise<RangeReport> {
  const [accountIds, channelAccountIds] = await Promise.all([
    getUserAccountIds(userId),
    getUserChannelAccountIds(userId),
  ]);

  const createdWhere = { createdAt: { gte: range.from, lt: range.to } };
  const resolvedWhere = { resolvedAt: { gte: range.from, lt: range.to } };

  const [
    createdWA,
    createdChannel,
    resolvedWA,
    resolvedChannel,
    openWA,
    openChannel,
    unassignedWA,
    unassignedChannel,
    messagesWA,
    messagesChannel,
    csat,
    outcomes,
  ] = await Promise.all([
    prisma.wAChat.findMany({
      where: { accountId: { in: accountIds }, ...createdWhere },
      select: WA_SELECT,
      orderBy: { createdAt: "desc" },
    }),
    prisma.conversation.findMany({
      where: { channelAccountId: { in: channelAccountIds }, ...createdWhere },
      select: CHANNEL_SELECT,
      orderBy: { createdAt: "desc" },
    }),
    prisma.wAChat.findMany({
      where: { accountId: { in: accountIds }, ...resolvedWhere },
      select: WA_SELECT,
      orderBy: { resolvedAt: "desc" },
    }),
    prisma.conversation.findMany({
      where: { channelAccountId: { in: channelAccountIds }, ...resolvedWhere },
      select: CHANNEL_SELECT,
      orderBy: { resolvedAt: "desc" },
    }),
    prisma.wAChat.count({ where: { accountId: { in: accountIds }, status: { in: ["OPEN", "PENDING"] } } }),
    prisma.conversation.count({ where: { channelAccountId: { in: channelAccountIds }, status: { in: ["OPEN", "PENDING"] } } }),
    prisma.wAChat.count({ where: { accountId: { in: accountIds }, status: { in: ["OPEN", "PENDING"] }, assignedToId: null } }),
    prisma.conversation.count({ where: { channelAccountId: { in: channelAccountIds }, status: { in: ["OPEN", "PENDING"] }, assignedToId: null } }),
    prisma.wAMessage.count({ where: { createdAt: { gte: range.from, lt: range.to }, chat: { accountId: { in: accountIds } } } }),
    prisma.channelMessage.count({ where: { createdAt: { gte: range.from, lt: range.to }, conversation: { channelAccountId: { in: channelAccountIds } } } }),
    prisma.csatResponse.aggregate({
      where: { accountId: { in: accountIds }, createdAt: { gte: range.from, lt: range.to } },
      _avg: { rating: true },
      _count: { _all: true, rating: true },
    }),
    // Mismo alcance que el resto del reporte: contactos de las cuentas que el
    // usuario ve (el evento es por organización, el contacto da la cuenta).
    prisma.leadOutcomeEvent.groupBy({
      by: ["outcome"],
      where: {
        createdAt: { gte: range.from, lt: range.to },
        outcome: { in: ["WON", "LOST"] },
        contact: { OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] },
      },
      _count: { _all: true },
      _sum: { valueCents: true },
    }),
  ]);
  const won = outcomes.find((row) => row.outcome === "WON");
  const lost = outcomes.find((row) => row.outcome === "LOST");

  type WA = (typeof createdWA)[number];
  type CH = (typeof createdChannel)[number];

  const toReportChat = (chat: WA | CH, channel: ReportChannel): ReportChat => {
    const wa = "remoteJid" in chat;
    return {
      id: chat.id,
      contactName: displayName(chat.contact?.name, wa ? chat.remoteJid : chat.externalId),
      remoteJid: wa ? chat.remoteJid : chat.externalId,
      status: chat.status,
      createdAt: chat.createdAt.toISOString(),
      resolvedAt: chat.resolvedAt?.toISOString() ?? null,
      channel,
      accountName: wa ? chat.account.name : chat.channelAccount.name,
    };
  };

  interface Acc {
    userId: string;
    userName: string;
    email: string | null;
    newChats: number;
    resolved: number;
    responseTimes: number[];
    resolutionTimes: number[];
    chats: Map<string, ReportChat>;
  }

  const agents = new Map<string, Acc>();
  function agentFor(chat: WA | CH): Acc | null {
    if (!chat.assignedToId) return null;
    let acc = agents.get(chat.assignedToId);
    if (!acc) {
      acc = {
        userId: chat.assignedToId,
        userName: chat.assignedTo?.name ?? "Agente",
        email: chat.assignedTo?.email ?? null,
        newChats: 0,
        resolved: 0,
        responseTimes: [],
        resolutionTimes: [],
        chats: new Map(),
      };
      agents.set(chat.assignedToId, acc);
    }
    return acc;
  }

  const responseTimes: number[] = [];
  const resolutionTimes: number[] = [];
  const channelTotals = new Map<ReportChannel, ChannelReport>();

  function addToChannel(channel: ReportChannel, kind: "created" | "resolved") {
    const entry = channelTotals.get(channel) ?? { channel, newChats: 0, resolved: 0 };
    if (kind === "created") entry.newChats++;
    else entry.resolved++;
    channelTotals.set(channel, entry);
  }

  for (const chat of createdWA) {
    addToChannel("WHATSAPP", "created");
    const acc = agentFor(chat);
    if (acc) {
      acc.newChats++;
      const reportChat = toReportChat(chat, "WHATSAPP");
      acc.chats.set(reportChat.id, reportChat);
    }
    if (chat.firstResponseAt) responseTimes.push(minutesBetween(chat.createdAt, chat.firstResponseAt));
  }
  for (const chat of createdChannel) {
    addToChannel(chat.channelAccount.channel, "created");
    const acc = agentFor(chat);
    if (acc) {
      acc.newChats++;
      const reportChat = toReportChat(chat, chat.channelAccount.channel);
      acc.chats.set(reportChat.id, reportChat);
    }
    if (chat.firstResponseAt) responseTimes.push(minutesBetween(chat.createdAt, chat.firstResponseAt));
  }
  for (const chat of resolvedWA) {
    addToChannel("WHATSAPP", "resolved");
    const acc = agentFor(chat);
    if (acc) {
      acc.resolved++;
      const reportChat = toReportChat(chat, "WHATSAPP");
      acc.chats.set(reportChat.id, reportChat);
    }
    if (chat.resolvedAt) resolutionTimes.push(minutesBetween(chat.createdAt, chat.resolvedAt));
  }
  for (const chat of resolvedChannel) {
    addToChannel(chat.channelAccount.channel, "resolved");
    const acc = agentFor(chat);
    if (acc) {
      acc.resolved++;
      const reportChat = toReportChat(chat, chat.channelAccount.channel);
      acc.chats.set(reportChat.id, reportChat);
    }
    if (chat.resolvedAt) resolutionTimes.push(minutesBetween(chat.createdAt, chat.resolvedAt));
  }

  const agentReports: AgentReport[] = Array.from(agents.values())
    .map((acc) => ({
      userId: acc.userId,
      userName: acc.userName,
      email: acc.email,
      newChats: acc.newChats,
      resolved: acc.resolved,
      avgFirstResponseMinutes: avg(acc.responseTimes),
      avgResolutionMinutes: avg(acc.resolutionTimes),
      chats: Array.from(acc.chats.values())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 100),
    }))
    .sort((a, b) => b.resolved - a.resolved || b.newChats - a.newChats);

  const channelOrder: ReportChannel[] = ["WHATSAPP", "TELEGRAM", "MESSENGER", "INSTAGRAM", "WEBCHAT"];
  const channels = channelOrder
    .map((channel) => channelTotals.get(channel) ?? { channel, newChats: 0, resolved: 0 })
    .filter((entry) => entry.newChats > 0 || entry.resolved > 0);

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    totals: {
      newChats: createdWA.length + createdChannel.length,
      resolved: resolvedWA.length + resolvedChannel.length,
      open: openWA + openChannel,
      unassigned: unassignedWA + unassignedChannel,
      messages: messagesWA + messagesChannel,
      avgFirstResponseMinutes: avg(responseTimes),
      avgResolutionMinutes: avg(resolutionTimes),
      csatSent: csat._count._all,
      csatResponses: csat._count.rating,
      csatAvg: csat._avg.rating == null ? null : Math.round(csat._avg.rating * 10) / 10,
      wonCount: won?._count._all ?? 0,
      wonValueCents: won?._sum.valueCents ?? 0,
      lostCount: lost?._count._all ?? 0,
      lostValueCents: lost?._sum.valueCents ?? 0,
    },
    agents: agentReports,
    channels,
  };
}
