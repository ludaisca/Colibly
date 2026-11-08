import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { assignAccountHues, type AccountHues } from "@/app/components/ui/hue";

// Tonos de todas las cuentas (WhatsApp y otros canales) de la organización,
// sin choques. Es de la organización entera para que cada persona vea los
// mismos colores. Una vez por petición (cache de React).
export const getOrgAccountHues = cache(async (organizationId: string): Promise<AccountHues> => {
  const [wa, channels] = await Promise.all([
    prisma.wAAccount.findMany({ where: { organizationId }, select: { id: true, createdAt: true } }),
    prisma.channelAccount.findMany({ where: { organizationId }, select: { id: true, createdAt: true } }),
  ]);
  return assignAccountHues([...wa, ...channels]);
});
