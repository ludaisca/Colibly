import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Carga de mensajes de un chat, compartida por
// GET /api/whatsapp/chats/[chatId]/messages y por GET /api/inbox/sync (que
// trae los últimos del chat abierto en la misma respuesta que la lista). El
// caller ya resolvió el canal y el acceso con resolveChatChannel().

export type ChatChannel = "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";

const MESSAGE_SELECT = {
  id: true,
  direction: true,
  messageType: true,
  body: true,
  caption: true,
  mediaId: true,
  mediaUrl: true,
  mimeType: true,
  filename: true,
  bytesSize: true,
  transcript: true,
  status: true,
  timestamp: true,
} as const;

// interactivePayload (botones/lista enviados, u opción elegida) existe en
// ambas tablas desde las automatizaciones. isFromComment (roadmap P3-c) es
// exclusivo de ChannelMessage.
export const WA_MESSAGE_SELECT = {
  ...MESSAGE_SELECT,
  interactivePayload: true,
  wamid: true,
  replyToWamid: true,
  errorCode: true,
  errorMessage: true,
  reactionEmoji: true,
  agentReactionEmoji: true,
  // Ubicación, contactos… (structuredContentOf): la bandeja pinta la ubicación.
  content: true,
  agentReactions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true, emoji: true, status: true, error: true } },
} satisfies Prisma.WAMessageSelect;

export const CHANNEL_MESSAGE_SELECT = {
  ...MESSAGE_SELECT,
  interactivePayload: true,
  isFromComment: true,
  externalMessageId: true,
  replyToExternalId: true,
  reactionEmoji: true,
  agentReactionEmoji: true,
} as const;

type WaMessageRow = Prisma.WAMessageGetPayload<{ select: typeof WA_MESSAGE_SELECT }>;
type ChannelMessageRow = Prisma.ChannelMessageGetPayload<{ select: typeof CHANNEL_MESSAGE_SELECT }>;

// Al leer el hilo se marcan como leídos. El poll pasa por aquí cada pocos
// segundos: solo se escribe si había no leídos (antes era un UPDATE —y un
// updated_at nuevo— en cada tick).
export async function markChatRead(chatId: string, channel: ChatChannel): Promise<void> {
  if (channel === "WHATSAPP") {
    await prisma.wAChat.updateMany({ where: { id: chatId, unreadCount: { gt: 0 } }, data: { unreadCount: 0 } });
  } else {
    await prisma.conversation.updateMany({ where: { id: chatId, unreadCount: { gt: 0 } }, data: { unreadCount: 0 } });
  }
}

/** Mensajes de WhatsApp (orden ascendente) con el citado resuelto. */
export async function withWaReplies(chatId: string, ascending: WaMessageRow[]) {
  const quotedIds = [...new Set(ascending.map((message) => message.replyToWamid).filter((id): id is string => !!id))];
  const quoted = quotedIds.length
    ? await prisma.wAMessage.findMany({
        where: { chatId, wamid: { in: quotedIds } },
        select: { wamid: true, id: true, direction: true, body: true, caption: true, messageType: true, filename: true, mediaUrl: true },
      })
    : [];
  const quotedByWamid = new Map(quoted.map((message) => [message.wamid, message]));
  return ascending.map((message) => ({
    ...message,
    replyTo: message.replyToWamid ? quotedByWamid.get(message.replyToWamid) ?? null : null,
  }));
}

/** Mensajes de un canal genérico (orden ascendente) con el shape de WhatsApp. */
export async function withChannelReplies(chatId: string, ascending: ChannelMessageRow[]) {
  const quotedIds = [...new Set(ascending.map((message) => message.replyToExternalId).filter((id): id is string => !!id))];
  const quoted = quotedIds.length
    ? await prisma.channelMessage.findMany({
        where: { conversationId: chatId, externalMessageId: { in: quotedIds } },
        select: { externalMessageId: true, id: true, direction: true, body: true, caption: true, messageType: true, filename: true, mediaUrl: true },
      })
    : [];
  const quotedById = new Map(quoted.map((message) => [message.externalMessageId, message]));
  return ascending.map((message) => ({
    ...message,
    wamid: message.externalMessageId,
    replyToWamid: message.replyToExternalId,
    replyTo: message.replyToExternalId ? quotedById.get(message.replyToExternalId) ?? null : null,
  }));
}

/**
 * Los últimos `limit` mensajes (o los anteriores a `before`, o desde `since`), en orden
 * ascendente, y marca el chat como leído.
 */
export async function loadLatestMessages(
  chatId: string,
  channel: ChatChannel,
  options: { limit: number; before?: Date; since?: Date }
) {
  const { limit, before, since } = options;
  // `since` (sync de la bandeja): ese mensaje y los posteriores. `before`: historial.
  const range = before ? { lt: before } : since ? { gte: since } : undefined;
  if (channel !== "WHATSAPP") {
    const rows = await prisma.channelMessage.findMany({
      where: { conversationId: chatId, ...(range ? { timestamp: range } : {}) },
      select: CHANNEL_MESSAGE_SELECT,
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    await markChatRead(chatId, channel);
    return withChannelReplies(chatId, rows.reverse());
  }
  const rows = await prisma.wAMessage.findMany({
    where: { chatId, messageType: { not: "reaction" }, ...(range ? { timestamp: range } : {}) },
    select: WA_MESSAGE_SELECT,
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  await markChatRead(chatId, channel);
  return withWaReplies(chatId, rows.reverse());
}
