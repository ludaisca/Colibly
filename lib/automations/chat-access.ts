import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import type { AccountRef, ChatRef } from "@/lib/events/types";

// Acceso por chat (cualquier rol que pueda trabajar el chat, incluido el
// ejecutivo): lo usan el chip de automatización del inbox y el inicio manual.
export async function resolveChatForAutomations(
  chatId: string,
  userId: string
): Promise<{ chat: ChatRef; account: AccountRef; contactId: string | null } | null> {
  const resolved = await resolveChatChannel(chatId, userId);
  if (!resolved) return null;
  if (resolved.channel === "WHATSAPP") {
    const chat = await prisma.wAChat.findUnique({ where: { id: chatId }, select: { accountId: true, contactId: true } });
    if (!chat) return null;
    return { chat: { kind: "whatsapp", id: chatId }, account: { kind: "whatsapp", id: chat.accountId }, contactId: chat.contactId };
  }
  const conversation = await prisma.conversation.findUnique({
    where: { id: chatId },
    select: { contactId: true, channelAccount: { select: { id: true, channel: true } } },
  });
  if (!conversation) return null;
  return {
    chat: { kind: "channel", id: chatId },
    account: { kind: "channel", id: conversation.channelAccount.id, channel: conversation.channelAccount.channel },
    contactId: conversation.contactId,
  };
}

// ¿El usuario puede ver/actuar sobre esta ejecución? Por el chat al que pertenece.
export async function findRunForUser(runId: string, userId: string) {
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: { automation: { select: { id: true, name: true } } },
  });
  const chatId = run?.waChatId ?? run?.conversationId;
  if (!run || !chatId) return null;
  return (await resolveChatForAutomations(chatId, userId)) ? run : null;
}
