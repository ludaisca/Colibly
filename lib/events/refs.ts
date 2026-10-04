import { prisma } from "@/lib/prisma";
import type { AccountRef, ChatRef } from "./types";

export interface EventRefs {
  account: AccountRef;
  chat: ChatRef | null;
  contactId: string | null;
}

// Para emisores que solo tienen un id a mano (rutas de contactos, citas,
// scoring). El ingest arma las refs directamente porque ya tiene todo.
export async function eventRefsForContact(contactId: string): Promise<EventRefs | null> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      accountId: true,
      channelAccount: { select: { id: true, channel: true } },
      chat: { select: { id: true } },
      conversation: { select: { id: true } },
    },
  });
  if (!contact) return null;
  if (contact.accountId) {
    return {
      account: { kind: "whatsapp", id: contact.accountId },
      chat: contact.chat ? { kind: "whatsapp", id: contact.chat.id } : null,
      contactId,
    };
  }
  if (contact.channelAccount) {
    return {
      account: { kind: "channel", id: contact.channelAccount.id, channel: contact.channelAccount.channel },
      chat: contact.conversation ? { kind: "channel", id: contact.conversation.id } : null,
      contactId,
    };
  }
  return null;
}

// chatId = WAChat.id o Conversation.id (mismo criterio que lib/chat-resolver.ts).
export async function eventRefsForChat(chatId: string): Promise<EventRefs | null> {
  const waChat = await prisma.wAChat.findUnique({ where: { id: chatId }, select: { accountId: true, contactId: true } });
  if (waChat) {
    return { account: { kind: "whatsapp", id: waChat.accountId }, chat: { kind: "whatsapp", id: chatId }, contactId: waChat.contactId };
  }
  const conversation = await prisma.conversation.findUnique({
    where: { id: chatId },
    select: { contactId: true, channelAccount: { select: { id: true, channel: true } } },
  });
  if (conversation) {
    return {
      account: { kind: "channel", id: conversation.channelAccount.id, channel: conversation.channelAccount.channel },
      chat: { kind: "channel", id: chatId },
      contactId: conversation.contactId,
    };
  }
  return null;
}
