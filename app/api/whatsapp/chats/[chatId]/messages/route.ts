import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";

const MESSAGE_SELECT = {
  id: true,
  direction: true,
  messageType: true,
  body: true,
  caption: true,
  mediaId: true,
  mediaUrl: true,
  mimeType: true,
  filename: true,
  bytesSize: true,
  status: true,
  timestamp: true,
} as const;

// ChannelMessage (Telegram) no tiene interactivePayload — columna exclusiva
// de WAMessage, ver "Mensajes interactivos" en AGENTS.md.
const WA_MESSAGE_SELECT = { ...MESSAGE_SELECT, interactivePayload: true } as const;

export async function GET(
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

    const { searchParams } = new URL(req.url);
    const before = searchParams.get("before");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

    let beforeDate: Date | undefined;
    if (before) {
      beforeDate = new Date(before);
      if (isNaN(beforeDate.getTime())) {
        return NextResponse.json({ error: "Parámetro 'before' inválido" }, { status: 400 });
      }
    }

    if (resolved.channel === "TELEGRAM") {
      const messages = await prisma.channelMessage.findMany({
        where: { conversationId: chatId, ...(beforeDate ? { timestamp: { lt: beforeDate } } : {}) },
        select: MESSAGE_SELECT,
        orderBy: { timestamp: "desc" },
        take: limit,
      });
      await prisma.conversation.update({ where: { id: chatId }, data: { unreadCount: 0 } });
      return NextResponse.json(messages.reverse());
    }

    const messages = await prisma.wAMessage.findMany({
      where: { chatId, ...(beforeDate ? { timestamp: { lt: beforeDate } } : {}) },
      select: WA_MESSAGE_SELECT,
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    await prisma.wAChat.update({
      where: { id: chatId },
      data: { unreadCount: 0 },
    });

    return NextResponse.json(messages.reverse());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
