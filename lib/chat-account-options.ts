import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import type { AccountOption, Channel } from "@/app/components/whatsapp/chat-shared";

const CHANNEL_ORDER: Record<Exclude<Channel, "WHATSAPP">, number> = {
  TELEGRAM: 0,
  MESSENGER: 1,
  INSTAGRAM: 2,
  WEBCHAT: 3,
};

// El primer cuadro del inbox ya conoce sus cuentas: el riel de escritorio y
// el selector móvil ocupan su lugar antes de que terminen los fetches cliente.
export async function getChatAccountOptions(userId: string): Promise<AccountOption[]> {
  const [waIds, channelIds] = await Promise.all([
    getUserAccountIds(userId),
    getUserChannelAccountIds(userId),
  ]);
  const [waAccounts, channelAccounts] = await Promise.all([
    prisma.wAAccount.findMany({
      where: { id: { in: waIds } },
      select: { id: true, name: true, phoneNumber: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.channelAccount.findMany({
      where: { id: { in: channelIds } },
      select: { id: true, name: true, channel: true, updatedAt: true },
    }),
  ]);

  const otherAccounts = channelAccounts
    .filter((account) => account.channel in CHANNEL_ORDER)
    .sort((a, b) =>
      CHANNEL_ORDER[a.channel as Exclude<Channel, "WHATSAPP">] - CHANNEL_ORDER[b.channel as Exclude<Channel, "WHATSAPP">]
      || b.updatedAt.getTime() - a.updatedAt.getTime()
    )
    .map(({ id, name, channel }) => ({ id, name, phoneNumber: null, channel: channel as Channel }));

  return [
    ...waAccounts.map(({ id, name, phoneNumber }) => ({ id, name, phoneNumber, channel: "WHATSAPP" as const })),
    ...otherAccounts,
  ];
}
