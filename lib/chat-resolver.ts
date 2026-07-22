import { prisma } from "@/lib/prisma";
import { getUserAccountIds } from "@/lib/shared-accounts";

// Un chatId que llega a /api/whatsapp/chats/[chatId]/* puede ser un WAChat.id
// o un Conversation.id (Telegram) — mismo cuid(), tablas distintas, sin
// colisión práctica entre ambas. En vez de duplicar cada ruta satélite
// (assign/assignees/tags/usage/messages/status/send) bajo /api/telegram/,
// esas rutas resuelven el canal con este helper y bifurcan internamente.
// ChannelAccount no tiene equivalente de WAAccountShare todavía, así que la
// membresía de Telegram se resuelve por channelAccount.userId directo.
// Devuelve también los accountIds ya resueltos: los handlers que ramifican por
// canal casi siempre vuelven a necesitarlos, y sin esto cada request ejecutaba
// getUserAccountIds() dos veces (una aquí y otra en la ruta).
export interface ResolvedChat {
  channel: "WHATSAPP" | "TELEGRAM";
  accountIds: string[];
}

export async function resolveChatChannel(chatId: string, userId: string): Promise<ResolvedChat | null> {
  const accountIds = await getUserAccountIds(userId);
  const waChat = await prisma.wAChat.findFirst({
    where: { id: chatId, accountId: { in: accountIds } },
    select: { id: true },
  });
  if (waChat) return { channel: "WHATSAPP", accountIds };

  const conversation = await prisma.conversation.findFirst({
    where: { id: chatId, channelAccount: { userId } },
    select: { id: true },
  });
  if (conversation) return { channel: "TELEGRAM", accountIds };

  return null;
}
