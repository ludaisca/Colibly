import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { publicErrorMessage } from "@/lib/api-errors";

// Todas las cuentas del admin (WhatsApp + canales) en una lista, para acotar
// el alcance de una API key o de un webhook desde la UI.
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(admin.userId),
      getUserChannelAccountIds(admin.userId),
    ]);
    const [wa, channels] = await Promise.all([
      prisma.wAAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.channelAccount.findMany({
        where: { id: { in: channelAccountIds } },
        select: { id: true, name: true, channel: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return NextResponse.json([
      ...wa.map((a) => ({ id: a.id, name: a.name, channel: "WHATSAPP" as const })),
      ...channels.map((a) => ({ id: a.id, name: a.name, channel: a.channel })),
    ]);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
