import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";

const VALID_STATUSES = ["OPEN", "PENDING", "RESOLVED"] as const;

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
    const status = body?.status;

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
    }

    if (resolved.channel !== "WHATSAPP") {
      const current = await prisma.conversation.findUniqueOrThrow({ where: { id: chatId }, select: { status: true } });
      const wasResolved = current.status === "RESOLVED";
      const willBeResolved = status === "RESOLVED";
      const updated = await prisma.conversation.update({
        where: { id: chatId },
        data: { status, resolvedAt: willBeResolved ? new Date() : wasResolved && !willBeResolved ? null : undefined },
        select: { id: true, status: true, resolvedAt: true },
      });
      return NextResponse.json(updated);
    }

    const chat = await prisma.wAChat.findUniqueOrThrow({ where: { id: chatId }, select: { status: true } });
    const wasResolved = chat.status === "RESOLVED";
    const willBeResolved = status === "RESOLVED";

    const updated = await prisma.wAChat.update({
      where: { id: chatId },
      data: {
        status,
        resolvedAt: willBeResolved ? new Date() : wasResolved && !willBeResolved ? null : undefined,
      },
      select: { id: true, status: true, resolvedAt: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
