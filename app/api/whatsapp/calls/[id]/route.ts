import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { callingErrorResponse } from "@/lib/whatsapp/calling/access";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const accountIds = await getUserAccountIds(session.user.id);
    const call = await prisma.wACall.findFirst({
      where: { id, accountId: { in: accountIds } },
      select: {
        id: true,
        accountId: true,
        chatId: true,
        direction: true,
        status: true,
        peerWaId: true,
        peerName: true,
        sdpOffer: true,
        sdpAnswer: true,
        answeredById: true,
      },
    });
    if (!call) return NextResponse.json({ error: "Llamada no encontrada" }, { status: 404 });
    return NextResponse.json(call);
  } catch (error) {
    return callingErrorResponse(error, "No se pudo cargar la llamada");
  }
}
