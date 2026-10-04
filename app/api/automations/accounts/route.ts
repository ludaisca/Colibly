import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { requireAutomationSession } from "@/lib/automations/access";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";

// Cuentas (propias + compartidas, todos los canales) en las que el usuario
// puede crear automatizaciones.
export async function GET() {
  try {
    const session = await requireAutomationSession();
    if (session instanceof NextResponse) return session;
    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);
    const [wa, channels] = await Promise.all([
      prisma.wAAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.channelAccount.findMany({ where: { id: { in: channelAccountIds } }, select: { id: true, name: true, channel: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json([
      ...wa.map((a) => ({ id: a.id, name: a.name, channel: "WHATSAPP" as const })),
      ...channels.map((a) => ({ id: a.id, name: a.name, channel: a.channel })),
    ]);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
