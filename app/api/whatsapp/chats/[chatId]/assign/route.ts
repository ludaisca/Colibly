import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEligibleAssignees } from "@/lib/chat-assignees";
import { resolveChatChannel } from "@/lib/chat-resolver";

const ASSIGNEE_SELECT = {
  id: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true } },
} as const;

export async function PATCH(
  req: Request,
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

    const body = await req.json();
    const assignedToId: string | null = body?.assignedToId ?? null;

    if (resolved.channel === "TELEGRAM") {
      // Sin WAAccountShare equivalente todavía — el único elegible es el
      // dueño de la cuenta de Telegram (ver lib/telegram/auto-assign.ts).
      if (assignedToId !== null) {
        const conversation = await prisma.conversation.findUnique({
          where: { id: chatId },
          select: { channelAccount: { select: { userId: true } } },
        });
        if (conversation?.channelAccount.userId !== assignedToId) {
          return NextResponse.json({ error: "Usuario no válido para esta cuenta" }, { status: 400 });
        }
      }
      const updated = await prisma.conversation.update({
        where: { id: chatId },
        data: { assignedToId },
        select: ASSIGNEE_SELECT,
      });
      return NextResponse.json(updated);
    }

    const chat = await prisma.wAChat.findFirst({
      where: { id: chatId, accountId: { in: resolved.accountIds } },
      select: { accountId: true },
    });
    if (!chat) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    if (assignedToId !== null) {
      const eligible = await getEligibleAssignees(chat.accountId);
      if (!eligible.some((a) => a.id === assignedToId)) {
        return NextResponse.json({ error: "Usuario no válido para esta cuenta" }, { status: 400 });
      }
    }

    const updated = await prisma.wAChat.update({
      where: { id: chatId },
      data: { assignedToId },
      select: ASSIGNEE_SELECT,
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
