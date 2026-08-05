import { prisma } from "@/lib/prisma";

export async function getUserAccountIds(userId: string): Promise<string[]> {
  const [ownAccounts, shared] = await Promise.all([
    prisma.wAAccount.findMany({
      where: { userId },
      select: { id: true },
    }),
    prisma.wAAccountShare.findMany({
      where: { userId },
      select: { waAccountId: true },
    }),
  ]);

  const directIds = ownAccounts.map((a) => a.id);
  const sharedIds = shared.map((s) => s.waAccountId);
  return [...new Set([...directIds, ...sharedIds])];
}

// Equivalente a getUserAccountIds() para cuentas de Telegram — propias +
// compartidas vía ChannelAccountShare.
export async function getUserChannelAccountIds(userId: string): Promise<string[]> {
  const [ownAccounts, shared] = await Promise.all([
    prisma.channelAccount.findMany({
      where: { userId },
      select: { id: true },
    }),
    prisma.channelAccountShare.findMany({
      where: { userId },
      select: { channelAccountId: true },
    }),
  ]);

  const directIds = ownAccounts.map((a) => a.id);
  const sharedIds = shared.map((s) => s.channelAccountId);
  return [...new Set([...directIds, ...sharedIds])];
}
