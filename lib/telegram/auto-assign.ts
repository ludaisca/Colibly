import { prisma } from "@/lib/prisma";

// Versión simplificada de lib/whatsapp/auto-assign.ts: ChannelAccount no tiene
// un mecanismo de compartir (no existe ChannelAccountShare todavía), así que el
// único candidato posible es el dueño de la cuenta — igual respeta
// maxOpenChats en vez de asignar ciegamente.
export async function autoAssignConversation(channelAccountId: string, conversationId: string): Promise<string | null> {
  const account = await prisma.channelAccount.findUnique({
    where: { id: channelAccountId },
    select: { autoAssignEnabled: true, userId: true },
  });
  if (!account?.autoAssignEnabled) return null;

  const user = await prisma.user.findUnique({
    where: { id: account.userId },
    select: { maxOpenChats: true, disabledAt: true },
  });
  if (!user || user.disabledAt) return null;

  if (user.maxOpenChats !== null) {
    const openCount = await prisma.conversation.count({
      where: { channelAccountId, assignedToId: account.userId, status: { in: ["OPEN", "PENDING"] } },
    });
    if (openCount >= user.maxOpenChats) return null;
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { assignedToId: account.userId },
  });

  return account.userId;
}
