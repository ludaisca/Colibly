import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { getEligibleAssigneesForContact } from "@/lib/chat-assignees";

// Usado por el picker "Asignar a" del formulario de Citas — mismo criterio
// de elegibilidad que ya existe para asignar chats (dueño de la cuenta +
// WAAccountShare/ChannelAccountShare), generalizado a Contact en
// lib/chat-assignees.ts:getEligibleAssigneesForContact() porque un Contact
// puede colgar de cualquiera de los dos mundos.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const accountIds = await getUserAccountIds(session.user.id);
    const contact = await prisma.contact.findFirst({
      where: { id, OR: [{ accountId: { in: accountIds } }, { channelAccount: { userId: session.user.id } }] },
      select: { accountId: true, channelAccountId: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const assignees = await getEligibleAssigneesForContact(contact);
    return NextResponse.json(assignees);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
