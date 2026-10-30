import type { Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";

// Lógica compartida por GET /api/{telegram,messenger,instagram}/chats —
// mismo shape de respuesta que GET /api/whatsapp/chats (paginado, {items,
// total, page, pageSize}) para que chat-workspace.tsx pueda mezclar todas
// las fuentes sin normalizar formatos distintos. Alcance: cuentas propias +
// compartidas (ChannelAccountShare), igual que getUserAccountIds() en WhatsApp.
export type ChannelChatsResult =
  | { ok: true; paginate: boolean; data: unknown }
  | { ok: false; status: number; error: string };

export async function listChannelChats(userId: string, channel: Channel, searchParams: URLSearchParams): Promise<ChannelChatsResult> {
  const accountId = searchParams.get("accountId");
  const channelAccountIds = await getUserChannelAccountIds(userId);

  if (accountId) {
    // channel es obligatorio en este where — sin él, pasarle el accountId de
    // una cuenta de OTRO canal del mismo usuario devolvería 200 en vez de 404.
    const owned = await prisma.channelAccount.findFirst({
      where: { id: accountId, channel, AND: [{ id: { in: channelAccountIds } }] },
      select: { id: true },
    });
    if (!owned) {
      return { ok: false, status: 404, error: "Cuenta no encontrada" };
    }
  }

  const where: Record<string, unknown> = {
    channelAccountId: accountId ? accountId : { in: channelAccountIds },
    channelAccount: { channel },
  };
  const chatId = searchParams.get("chatId");
  if (chatId) where.id = chatId;

  const search = searchParams.get("search")?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { externalId: { contains: search } },
      { lastMessage: { contains: search, mode: "insensitive" } },
    ];
  }

  const statusParam = searchParams.get("status");
  if (statusParam) {
    const statuses = statusParam.split(",").filter((s) => ["OPEN", "PENDING", "RESOLVED"].includes(s));
    if (statuses.length > 0) where.status = { in: statuses };
  }

  const assignedParam = searchParams.get("assigned");
  if (assignedParam === "me") where.assignedToId = userId;
  else if (assignedParam === "unassigned") where.assignedToId = null;

  const priorityParam = searchParams.get("priority");
  if (priorityParam && ["LOW", "NORMAL", "HIGH", "URGENT"].includes(priorityParam)) {
    where.priority = priorityParam;
  }

  // hasReplied: sin campañas en estos canales, "yes" es simplemente cualquier
  // conversación con al menos un mensaje INBOUND — mismo criterio que
  // WhatsApp, sin el filtro adicional de campaignId (fuera de alcance).
  const hasRepliedParam = searchParams.get("hasReplied");
  if (hasRepliedParam === "yes") {
    where.messages = { some: { direction: "INBOUND" } };
  } else if (hasRepliedParam === "no") {
    where.messages = { none: { direction: "INBOUND" } };
  }

  const snoozedParam = searchParams.get("snoozed");
  if (snoozedParam === "only") {
    where.snoozedUntil = { gt: new Date() };
  } else if (snoozedParam !== "all") {
    where.AND = [{ OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }] }];
  }

  const pageParam = searchParams.get("page");
  const paginate = pageParam !== null;
  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 30, 1), 100);

  const select = {
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
    assignedToId: true,
    assignedTo: { select: { id: true, name: true } },
    createdAt: true,
    updatedAt: true,
    channelAccount: { select: { id: true, name: true } },
  } as const;

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      select,
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    }),
    paginate ? prisma.conversation.count({ where }) : Promise.resolve(null),
  ]);

  // Shape idéntico a /api/whatsapp/chats: remoteJid/accountId/isGroup/account
  // en vez de externalId/channelAccountId/channelAccount, más un discriminador
  // channel real y campaign siempre null (las campañas no existen en estos canales).
  const chats = rows.map((c) => ({
    id: c.id,
    accountId: c.channelAccountId,
    remoteJid: c.externalId,
    name: c.name,
    isGroup: c.isGroup,
    lastMessage: c.lastMessage,
    lastMessageAt: c.lastMessageAt,
    unreadCount: c.unreadCount,
    contactId: c.contactId,
    status: c.status,
    priority: c.priority,
    snoozedUntil: c.snoozedUntil,
    assignedToId: c.assignedToId,
    assignedTo: c.assignedTo,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    account: { id: c.channelAccount.id, name: c.channelAccount.name, phoneNumber: null },
    campaign: null,
    channel,
  }));

  return {
    ok: true,
    paginate,
    data: paginate ? { items: chats, total, page, pageSize } : chats,
  };
}
