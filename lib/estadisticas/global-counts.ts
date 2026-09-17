import { prisma } from "@/lib/prisma";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";

// Contadores globales compartidos por /dashboard, /whatsapp (hub) y
// /estadisticas (get-stats.ts). Antes cada pantalla reimplementaba estas
// queries con cláusulas `where` ligeramente distintas para el mismo concepto —
// si cambiaba el modelo de cuentas compartidas, podían divergir en silencio.
// Todo lo scoping por cuenta se expresa vía `accountIds` (el resultado de
// getUserAccountIds, propias + compartidas); lo scoping por dueño vía `userId`.

// Los canales adicionales viven en tablas propias
// (ChannelAccount/Conversation/ChannelMessage) y se scopean con
// getUserChannelAccountIds(userId) — propias + compartidas, el equivalente de
// accountIds. Cada contador suma ambos mundos.
export async function countTotalAccounts(accountIds: string[], userId: string) {
  return accountIds.length + (await getUserChannelAccountIds(userId)).length;
}

export async function countConnectedAccounts(accountIds: string[], userId: string) {
  const [wa, channel] = await Promise.all([
    prisma.wAAccount.count({ where: { id: { in: accountIds }, status: "CONNECTED" } }),
    prisma.channelAccount.count({ where: { id: { in: await getUserChannelAccountIds(userId) }, status: "CONNECTED" } }),
  ]);
  return wa + channel;
}

export async function countChats(accountIds: string[], userId: string) {
  const [wa, channel] = await Promise.all([
    prisma.wAChat.count({ where: { accountId: { in: accountIds } } }),
    prisma.conversation.count({ where: { channelAccountId: { in: await getUserChannelAccountIds(userId) } } }),
  ]);
  return wa + channel;
}

export async function countMessages(accountIds: string[], userId: string) {
  const [wa, channel] = await Promise.all([
    prisma.wAMessage.count({ where: { chat: { accountId: { in: accountIds } } } }),
    prisma.channelMessage.count({ where: { conversation: { channelAccountId: { in: await getUserChannelAccountIds(userId) } } } }),
  ]);
  return wa + channel;
}

export function countBots(userId: string) {
  return prisma.wABot.count({ where: { userId } });
}

export function countActiveBots(userId: string) {
  return prisma.wABot.count({ where: { userId, isActive: true } });
}

export function countCampaigns(userId: string) {
  return prisma.wACampaign.count({ where: { userId } });
}

export function countCompletedCampaigns(userId: string) {
  return prisma.wACampaign.count({ where: { userId, status: "COMPLETED" } });
}
