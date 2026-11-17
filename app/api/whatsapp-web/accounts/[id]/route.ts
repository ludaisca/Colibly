import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { accountManageWhere } from "@/lib/tenancy";
import { invalidateAccountScopes } from "@/lib/shared-accounts";
import { forbidRoles } from "@/lib/roles";
import { releaseGowaDevice } from "@/lib/gowa/lifecycle";

// Borrar la cuenta cierra la sesión de WhatsApp y elimina el device en GoWA
// (best effort: si GoWA no responde, la cuenta se borra igual y el device
// huérfano ya no tiene adónde mandar eventos — su webhook responde 404).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const forbidden = forbidRoles(session, ["ejecutivo"]);
    if (forbidden) return forbidden;

    const { allowed } = await rateLimit(`channel-account-mutate:${session.user.id}`, 20, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });

    const { id } = await params;
    const existing = await prisma.channelAccount.findFirst({
      where: { id, channel: "WHATSAPP_WEB", ...(await accountManageWhere(session.user.id)) },
    });
    if (!existing) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

    await releaseGowaDevice(existing);
    await prisma.channelAccount.delete({ where: { id } });
    invalidateAccountScopes();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
