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
      },
    });
    return NextResponse.json({
      telegram: org.channelTelegramEnabled,
      messenger: org.channelMessengerEnabled,
      instagram: org.channelInstagramEnabled,
      webchat: org.channelWebchatEnabled,
    });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudieron cargar los canales") }, { status: 500 });
  }
}
