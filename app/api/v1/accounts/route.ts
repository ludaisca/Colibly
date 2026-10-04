import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, withApiErrors } from "@/lib/api/respond";

// Cuentas al alcance de la key (WhatsApp y demás canales) — los ids que piden
// los demás endpoints. Nunca devuelve credenciales.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req);
  const [wa, channels] = await Promise.all([
    prisma.wAAccount.findMany({
      where: { id: { in: ctx.accountIds } },
      select: { id: true, name: true, phoneNumber: true, status: true },
      orderBy: { name: "asc" },
    }),
    prisma.channelAccount.findMany({
      where: { id: { in: ctx.channelAccountIds } },
      select: { id: true, name: true, channel: true, status: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return apiOk({
    data: [
      ...wa.map((a) => ({ id: a.id, channel: "WHATSAPP", name: a.name, phoneNumber: a.phoneNumber, status: a.status })),
      ...channels.map((a) => ({ id: a.id, channel: a.channel, name: a.name, phoneNumber: null, status: a.status })),
    ],
  });
});
