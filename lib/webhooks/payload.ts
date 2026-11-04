import { prisma } from "@/lib/prisma";
import type { DomainEvent } from "@/lib/events/types";
import { MESSAGE_SERIALIZE_SELECT_CHANNEL, MESSAGE_SERIALIZE_SELECT_WA, resolveReplyIds, serializeMessage, type PublicMessage } from "@/lib/messages/serialize";

// Forma pública de un evento — lo que recibe un webhook (y lo que documenta
// /api/v1/openapi.json). Se arma una sola vez por evento en el fanout, con
// lectura fresca de contacto/conversación: nombres y etapa del momento de la
// entrega, mientras que `data` conserva el hecho tal como ocurrió (from/to).
export interface PublicEvent {
  id: string;
  type: string;
  occurredAt: string;
  account: { id: string; channel: string; name: string } | null;
  contact: {
    id: string;
    name: string | null;
    phone: string | null; // solo WhatsApp
    externalId: string | null; // Telegram/Messenger/Instagram/Web
    leadStatus: string;
    leadOrigin: string;
  } | null;
  conversation: { id: string; channel: string; status: string; assignedToId: string | null } | null;
  data: Record<string, unknown>;
  // Solo en `message.*`: el mensaje con la misma forma que la API
  // (lib/messages/serialize.ts), leído al entregar — estado y medio frescos.
  message?: PublicMessage | null;
}

async function loadPublicMessage(event: DomainEvent): Promise<PublicMessage | null> {
  const messageId = (event.data as { messageId?: unknown }).messageId;
  if (typeof messageId !== "string" || !event.chat) return null;
  const conversationId = event.chat.id;
  if (event.account.kind === "whatsapp") {
    const row = await prisma.wAMessage.findFirst({ where: { id: messageId, chatId: conversationId }, select: MESSAGE_SERIALIZE_SELECT_WA });
    if (!row) return null;
    const replies = await resolveReplyIds("whatsapp", conversationId, [row]);
    return serializeMessage(row, conversationId, { replyToMessageId: row.replyToWamid ? replies.get(row.replyToWamid) ?? null : null });
  }
  const row = await prisma.channelMessage.findFirst({ where: { id: messageId, conversationId }, select: MESSAGE_SERIALIZE_SELECT_CHANNEL });
  if (!row) return null;
  const replies = await resolveReplyIds("channel", conversationId, [row]);
  return serializeMessage(row, conversationId, { replyToMessageId: row.replyToExternalId ? replies.get(row.replyToExternalId) ?? null : null });
}

export async function buildPublicEvent(event: DomainEvent): Promise<PublicEvent> {
  const isWhatsapp = event.account.kind === "whatsapp";

  const [account, contact, conversation, message] = await Promise.all([
    isWhatsapp
      ? prisma.wAAccount.findUnique({ where: { id: event.account.id }, select: { id: true, name: true } })
      : prisma.channelAccount.findUnique({ where: { id: event.account.id }, select: { id: true, name: true } }),
    event.contactId
      ? prisma.contact.findUnique({
          where: { id: event.contactId },
          select: { id: true, name: true, realName: true, remoteJid: true, leadStatus: true, leadOrigin: true },
        })
      : null,
    event.chat
      ? event.chat.kind === "whatsapp"
        ? prisma.wAChat.findUnique({ where: { id: event.chat.id }, select: { id: true, status: true, assignedToId: true } })
        : prisma.conversation.findUnique({ where: { id: event.chat.id }, select: { id: true, status: true, assignedToId: true } })
      : null,
    event.type.startsWith("message.") ? loadPublicMessage(event) : null,
  ]);

  const channel = event.account.kind === "whatsapp" ? "WHATSAPP" : event.account.channel;

  return {
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    account: account ? { id: account.id, channel, name: account.name } : null,
    contact: contact
      ? {
          id: contact.id,
          name: contact.realName ?? contact.name,
          phone: isWhatsapp ? contact.remoteJid : null,
          externalId: isWhatsapp ? null : contact.remoteJid,
          leadStatus: contact.leadStatus,
          leadOrigin: contact.leadOrigin,
        }
      : null,
    conversation: conversation
      ? { id: conversation.id, channel, status: conversation.status, assignedToId: conversation.assignedToId }
      : null,
    data: event.data as Record<string, unknown>,
    ...(event.type.startsWith("message.") ? { message } : {}),
  };
}
