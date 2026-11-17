import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/tenancy";
import { publicErrorMessage } from "@/lib/api-errors";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const organizationId = await requireOrgId(session.user.id);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        channelTelegramEnabled: true,
        channelMessengerEnabled: true,
        channelInstagramEnabled: true,
        channelWebchatEnabled: true,
        channelWhatsappWebEnabled: true,
      },
    });
    // Estado real: cuántas cuentas de cada canal tiene conectadas la organización.
    const [whatsapp, byChannel] = await Promise.all([
      prisma.wAAccount.count({ where: { organizationId } }),
      prisma.channelAccount.groupBy({ by: ["channel"], where: { organizationId }, _count: { _all: true } }),
    ]);
    const connected = (channel: string) => byChannel.find((row) => row.channel === channel)?._count._all ?? 0;
    return NextResponse.json({
      telegram: org.channelTelegramEnabled,
      messenger: org.channelMessengerEnabled,
      instagram: org.channelInstagramEnabled,
      webchat: org.channelWebchatEnabled,
      whatsappWeb: org.channelWhatsappWebEnabled,
      connected: {
        whatsapp,
        telegram: connected("TELEGRAM"),
        messenger: connected("MESSENGER"),
        instagram: connected("INSTAGRAM"),
        webchat: connected("WEBCHAT"),
        whatsappWeb: org.channelWhatsappWebEnabled ? connected("WHATSAPP_WEB") : 0,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudieron cargar los canales") }, { status: 500 });
  }
}
