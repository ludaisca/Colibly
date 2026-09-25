import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";

// Un chatId que llega a /api/whatsapp/chats/[chatId]/* puede ser un WAChat.id
// o un Conversation.id (Telegram) — mismo cuid(), tablas distintas, sin
// colisión práctica entre ambas. En vez de duplicar cada ruta satélite
// (assign/assignees/tags/usage/messages/status/send) bajo /api/telegram/,
// esas rutas resuelven el canal con este helper y bifurcan internamente.
// La membresía de Telegram honra tanto la cuenta propia como el acceso vía
// ChannelAccountShare, igual que getUserAccountIds() ya hace para WhatsApp.
// Devuelve también los accountIds ya resueltos: los handlers que ramifican por
// canal casi siempre vuelven a necesitarlos, y sin esto cada request ejecutaba
// getUserAccountIds() dos veces (una aquí y otra en la ruta).
export interface ResolvedChat {
  channel: "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";
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
    where: { id: chatId, channelAccountId: { in: await getUserChannelAccountIds(userId) } },
    select: { channelAccount: { select: { channel: true } } },
  });
  // El canal real de la ChannelAccount, no un literal fijo — con 3 canales
  // no-WhatsApp posibles (Telegram/Messenger/Instagram) asumir "TELEGRAM"
  // aquí era un bug (arreglado antes de sumar el tercer canal).
  if (conversation) return { channel: conversation.channelAccount.channel, accountIds };

  return null;
}
