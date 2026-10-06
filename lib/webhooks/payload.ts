import { prisma } from "@/lib/prisma";
import type { DomainEvent } from "@/lib/events/types";

// Forma pública de un evento — lo que recibe un webhook (y lo que documenta
// /api/v1/openapi.json). Se arma una sola vez por evento en el fanout, con
// lectura fresca de contacto/conversación: nombres del momento de la entrega,
// mientras que `data` conserva el hecho tal como ocurrió (p. ej. de qué etapa
// a cuál pasó un negocio).
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
    leadOrigin: string;
  } | null;
  conversation: { id: string; channel: string; status: string; assignedToId: string | null } | null;
  data: Record<string, unknown>;
}

export async function buildPublicEvent(event: DomainEvent): Promise<PublicEvent> {
  const isWhatsapp = event.account.kind === "whatsapp";

  const [account, contact, conversation] = await Promise.all([
    isWhatsapp
      ? prisma.wAAccount.findUnique({ where: { id: event.account.id }, select: { id: true, name: true } })
      : prisma.channelAccount.findUnique({ where: { id: event.account.id }, select: { id: true, name: true } }),
    event.contactId
      ? prisma.contact.findUnique({
          where: { id: event.contactId },
          select: { id: true, name: true, realName: true, remoteJid: true, leadOrigin: true },
        })
      : null,
    event.chat
      ? event.chat.kind === "whatsapp"
        ? prisma.wAChat.findUnique({ where: { id: event.chat.id }, select: { id: true, status: true, assignedToId: true } })
        : prisma.conversation.findUnique({ where: { id: event.chat.id }, select: { id: true, status: true, assignedToId: true } })
      : null,
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
          leadOrigin: contact.leadOrigin,
        }
      : null,
    conversation: conversation
      ? { id: conversation.id, channel, status: conversation.status, assignedToId: conversation.assignedToId }
      : null,
    data: event.data as Record<string, unknown>,
  };
}
