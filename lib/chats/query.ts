import { Prisma } from "@prisma/client";
import { phoneDigitsOf } from "./search-terms";
import { CHAT_ATTRIBUTION_MESSAGE_QUERY, resolveChatAttribution } from "@/lib/whatsapp/chat-attribution";
import { slaBreachFlags } from "@/lib/sla/rules";

// Capa compartida por GET /api/whatsapp/chats y lib/channel-chats.ts. No
// intenta ser un endpoint único: WhatsApp y Conversation viven en tablas
// distintas y cada una pagina sobre su propio total. Lo que sí unifica son
// las reglas (mismos filtros, mismo significado de snooze/asignación) y el
// shape que consume chat-workspace.tsx.

export interface ChatListFilters {
  accountId?: string;
  chatId?: string;
  statuses: string[];
  search?: string;
  assignedToId?: string | null;
  priority?: string;
  snoozed?: "only" | "all";
  campaignId?: string;
  hasReplied?: "yes" | "no";
  /** Solo chats cuyo cliente espera respuesta (waitingSince) y no están resueltos. */
  awaiting?: boolean;
  /** Solo chats fuera de SLA ahora (lib/sla/tick.ts mantiene sla*BreachedFor al día). */
  slaBreached?: boolean;
  /** Equipos: ids concretos (un equipo o "mis equipos", ya resueltos por el caller). */
  teamIds?: string[];
}

const STATUSES = ["OPEN", "PENDING", "RESOLVED"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

export function parseChatListFilters(searchParams: URLSearchParams, userId: string): ChatListFilters {
  const statusParam = searchParams.get("status");
  const statuses = statusParam
    ? statusParam.split(",").filter((value) => STATUSES.includes(value))
    : [];

  const assigned = searchParams.get("assigned");
  const assignedToId = assigned === "me"
    ? userId
    : assigned === "unassigned"
      ? null
      : undefined;

  const priorityParam = searchParams.get("priority");
  const snoozedParam = searchParams.get("snoozed");
  const repliedParam = searchParams.get("hasReplied");

  return {
    accountId: searchParams.get("accountId") || undefined,
    chatId: searchParams.get("chatId") || undefined,
    statuses,
    search: searchParams.get("search")?.trim() || undefined,
    assignedToId,
    priority: priorityParam && PRIORITIES.includes(priorityParam) ? priorityParam : undefined,
    snoozed: snoozedParam === "only" || snoozedParam === "all" ? snoozedParam : undefined,
    campaignId: searchParams.get("campaignId") || undefined,
    hasReplied: repliedParam === "yes" || repliedParam === "no" ? repliedParam : undefined,
    awaiting: searchParams.get("awaiting") === "1" || undefined,
    slaBreached: searchParams.get("sla") === "1" || undefined,
  };
}

export function buildWaChatWhere(filters: ChatListFilters, accountIds: string[]): Prisma.WAChatWhereInput {
  const where: Prisma.WAChatWhereInput = {
    // El caller ya valida accountId; aun así, uno ajeno nunca amplía el alcance.
    accountId: filters.accountId ? (accountIds.includes(filters.accountId) ? filters.accountId : { in: [] }) : { in: accountIds },
  };
  if (filters.chatId) where.id = filters.chatId;
  if (filters.statuses.length > 0) where.status = { in: filters.statuses as Array<"OPEN" | "PENDING" | "RESOLVED"> };
  if (filters.assignedToId !== undefined) where.assignedToId = filters.assignedToId;
  if (filters.priority) where.priority = filters.priority as "LOW" | "NORMAL" | "HIGH" | "URGENT";

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { remoteJid: { contains: filters.search } },
      ...(phoneDigitsOf(filters.search) ? [{ remoteJid: { contains: phoneDigitsOf(filters.search) as string } }] : []),
      { lastMessage: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const and: Prisma.WAChatWhereInput[] = [];
  if (filters.campaignId) and.push({ messages: { some: { campaignId: filters.campaignId } } });
  if (filters.hasReplied === "yes") and.push({ messages: { some: { direction: "INBOUND" } } });
  if (filters.hasReplied === "no") and.push({ messages: { none: { direction: "INBOUND" } } });
  if (filters.snoozed !== "all") {
    and.push(filters.snoozed === "only"
      ? { snoozedUntil: { gt: new Date() } }
      : { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }] });
  }
  if (filters.awaiting) and.push({ waitingSince: { not: null }, status: { not: "RESOLVED" } });
  if (filters.slaBreached) and.push(SLA_BREACHED_WHERE);
  if (filters.teamIds) and.push({ teamId: { in: filters.teamIds } });
  if (and.length > 0) where.AND = and;

  return where;
}

// null = este filtro no aplica al canal (una campaña solo existe en WhatsApp).
export function buildChannelChatWhere(
  filters: ChatListFilters,
  channelAccountIds: string[],
  // Sin canal = todos los canales genéricos a la vez (contadores de la bandeja).
  channel?: "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT"
): Prisma.ConversationWhereInput | null {
  if (filters.campaignId) return null;

  const where: Prisma.ConversationWhereInput = {
    // El caller ya valida accountId; aun así, uno ajeno nunca amplía el alcance.
    channelAccountId: filters.accountId
      ? (channelAccountIds.includes(filters.accountId) ? filters.accountId : { in: [] })
      : { in: channelAccountIds },
    ...(channel ? { channelAccount: { channel } } : {}),
  };
  if (filters.chatId) where.id = filters.chatId;
  if (filters.statuses.length > 0) where.status = { in: filters.statuses as Array<"OPEN" | "PENDING" | "RESOLVED"> };
  if (filters.assignedToId !== undefined) where.assignedToId = filters.assignedToId;
  if (filters.priority) where.priority = filters.priority as "LOW" | "NORMAL" | "HIGH" | "URGENT";

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { externalId: { contains: filters.search } },
      ...(phoneDigitsOf(filters.search) ? [{ externalId: { contains: phoneDigitsOf(filters.search) as string } }] : []),
      { lastMessage: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const and: Prisma.ConversationWhereInput[] = [];
  if (filters.hasReplied === "yes") and.push({ messages: { some: { direction: "INBOUND" } } });
  if (filters.hasReplied === "no") and.push({ messages: { none: { direction: "INBOUND" } } });
  if (filters.snoozed !== "all") {
    and.push(filters.snoozed === "only"
      ? { snoozedUntil: { gt: new Date() } }
      : { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }] });
  }
  if (filters.awaiting) and.push({ waitingSince: { not: null }, status: { not: "RESOLVED" } });
  if (filters.slaBreached) and.push(SLA_BREACHED_WHERE);
  if (filters.teamIds) and.push({ teamId: { in: filters.teamIds } });
  if (and.length > 0) where.AND = and;

  return where;
}

// "Fuera de SLA": el tick solo deja un aviso no nulo mientras corresponde al
// reloj actual, así que basta con mirar las columnas.
const SLA_BREACHED_WHERE = {
  status: "OPEN" as const,
  OR: [{ slaResponseBreachedFor: { not: null } }, { slaResolutionBreachedFor: { not: null } }],
};

// Selects compartidos para que el mapeo y las rutas no se desincronicen.
export const WA_CHAT_SELECT = {
  id: true,
  accountId: true,
  remoteJid: true,
  name: true,
  isGroup: true,
  lastMessage: true,
  lastMessageAt: true,
  unreadCount: true,
  contactId: true,
  status: true,
  priority: true,
  snoozedUntil: true,
  waitingSince: true,
  openedAt: true,
  teamId: true,
  team: { select: { id: true, name: true } },
  slaResponseBreachedFor: true,
  slaResolutionBreachedFor: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
  account: {
    select: { id: true, name: true, phoneNumber: true, coexistence: true, callingEnabled: true },
  },
  // Estación de la venta en la cabecera de la bandeja (Andén).
  contact: { select: { leadStatus: true } },
  messages: CHAT_ATTRIBUTION_MESSAGE_QUERY,
} as const;

export const CHANNEL_CHAT_SELECT = {
  id: true,
  channelAccountId: true,
  externalId: true,
  name: true,
  isGroup: true,
  lastMessage: true,
  lastMessageAt: true,
  unreadCount: true,
  contactId: true,
  status: true,
  priority: true,
  snoozedUntil: true,
  waitingSince: true,
  openedAt: true,
  teamId: true,
  team: { select: { id: true, name: true } },
  slaResponseBreachedFor: true,
  slaResolutionBreachedFor: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
  channelAccount: { select: { id: true, name: true, channel: true } },
  contact: { select: { leadStatus: true } },
} as const;

export type WaChatRow = Prisma.WAChatGetPayload<{ select: typeof WA_CHAT_SELECT }>;
export type ChannelChatRow = Prisma.ConversationGetPayload<{ select: typeof CHANNEL_CHAT_SELECT }>;

export function mapWaChatRow(row: WaChatRow) {
  const { messages, contact, openedAt: _opened, slaResponseBreachedFor: _r, slaResolutionBreachedFor: _z, ...chat } = row;
  return {
    ...chat,
    leadStatus: contact?.leadStatus ?? null,
    sla: slaBreachFlags(row),
    campaign: resolveChatAttribution(messages),
    channel: "WHATSAPP" as const,
  };
}

export function mapChannelChatRow(row: ChannelChatRow) {
  return {
    id: row.id,
    accountId: row.channelAccountId,
    remoteJid: row.externalId,
    name: row.name,
    isGroup: row.isGroup,
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt,
    unreadCount: row.unreadCount,
    contactId: row.contactId,
    status: row.status,
    priority: row.priority,
    snoozedUntil: row.snoozedUntil,
    waitingSince: row.waitingSince,
    leadStatus: row.contact?.leadStatus ?? null,
    sla: slaBreachFlags(row),
    teamId: row.teamId,
    team: row.team,
    assignedToId: row.assignedToId,
    assignedTo: row.assignedTo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    account: { id: row.channelAccount.id, name: row.channelAccount.name, phoneNumber: null },
    campaign: null,
    channel: row.channelAccount.channel,
  };
}
