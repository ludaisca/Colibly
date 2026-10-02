import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";

// Dueño de la cuenta del chat, no session.user.id — un usuario con acceso
// vía cuenta compartida ve los calificadores del dueño de la cuenta.
async function getChatOwnerUserId(chatId: string, channel: "WHATSAPP" | "TELEGRAM"): Promise<string | null> {
  if (channel === "TELEGRAM") {
    const conversation = await prisma.conversation.findUnique({
      where: { id: chatId },
      select: { channelAccount: { select: { userId: true } } },
    });
    return conversation?.channelAccount.userId ?? null;
  }
  const chat = await prisma.wAChat.findUnique({
    where: { id: chatId },
    select: { account: { select: { userId: true } } },
  });
  return chat?.account.userId ?? null;
}

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
    if (resolved.channel === "MESSENGER" || resolved.channel === "INSTAGRAM" || resolved.channel === "WEBCHAT") {
      return NextResponse.json({ error: "Calificación de leads no disponible para este canal" }, { status: 400 });
    }

    const ownerUserId = await getChatOwnerUserId(chatId, resolved.channel);
    if (!ownerUserId) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    const scorers = await prisma.wALeadScorerBot.findMany({
      where: { userId: ownerUserId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(scorers);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
