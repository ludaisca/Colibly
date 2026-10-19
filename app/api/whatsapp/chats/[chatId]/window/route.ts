import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";
import { getChatServiceWindow } from "@/lib/whatsapp/service-window";

// Estado de la ventana de 24 h de un chat de WhatsApp (banner de la bandeja).
export async function GET(_req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { chatId } = await params;
    const resolved = await resolveChatChannel(chatId, session.user.id);
    if (!resolved || resolved.channel !== "WHATSAPP") return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    const chat = await prisma.wAChat.findFirst({ where: { id: chatId, accountId: { in: resolved.accountIds } }, select: { id: true } });
    if (!chat) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    return NextResponse.json(await getChatServiceWindow(chat.id));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
