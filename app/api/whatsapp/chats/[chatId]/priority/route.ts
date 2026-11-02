import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";

const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
type Priority = (typeof PRIORITIES)[number];

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

    const body = await req.json().catch(() => null);
    const priority = body?.priority as Priority | undefined;
    if (!priority || !PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: "Prioridad no válida" }, { status: 400 });
    }

    if (resolved.channel !== "WHATSAPP") {
      const updated = await prisma.conversation.update({
        where: { id: chatId },
        data: { priority },
        select: { id: true, priority: true },
      });
      return NextResponse.json(updated);
    }

    const updated = await prisma.wAChat.update({
      where: { id: chatId },
      data: { priority },
      select: { id: true, priority: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
