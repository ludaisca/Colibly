import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEligibleAssignees, getEligibleChannelAssignees } from "@/lib/chat-assignees";
import { resolveChatChannel } from "@/lib/chat-resolver";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { chatId } = await params;
    const resolved = await resolveChatChannel(chatId, session.user.id);
    if (!resolved) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    if (resolved.channel !== "WHATSAPP") {
      // Dueño de la cuenta + usuarios con ChannelAccountShare (activos).
      const conversation = await prisma.conversation.findUnique({
        where: { id: chatId },
        select: { channelAccountId: true },
      });
      return NextResponse.json(conversation ? await getEligibleChannelAssignees(conversation.channelAccountId) : []);
    }

    const chat = await prisma.wAChat.findFirst({
      where: { id: chatId, accountId: { in: resolved.accountIds } },
      select: { accountId: true },
    });

    if (!chat) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    const assignees = await getEligibleAssignees(chat.accountId);

    return NextResponse.json(assignees);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
