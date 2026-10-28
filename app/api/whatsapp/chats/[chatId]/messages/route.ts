import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";

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

// interactivePayload (botones/lista enviados, u opción elegida) existe en
// ambas tablas desde las automatizaciones. isFromComment (roadmap P3-c) es
// exclusivo de ChannelMessage.
const WA_MESSAGE_SELECT = {
  ...MESSAGE_SELECT,
  interactivePayload: true,
  wamid: true,
  replyToWamid: true,
  errorCode: true,
  errorMessage: true,
  reactionEmoji: true,
  agentReactionEmoji: true,
  agentReactions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true, emoji: true, status: true, error: true } },
} satisfies Prisma.WAMessageSelect;
const CHANNEL_MESSAGE_SELECT = {
  ...MESSAGE_SELECT,
  interactivePayload: true,
  isFromComment: true,
  externalMessageId: true,
  replyToExternalId: true,
  reactionEmoji: true,
  agentReactionEmoji: true,
} as const;

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

    if (resolved.channel !== "WHATSAPP") {
      const messages = await prisma.channelMessage.findMany({
        where: { conversationId: chatId, ...(beforeDate ? { timestamp: { lt: beforeDate } } : {}) },
        select: CHANNEL_MESSAGE_SELECT,
        orderBy: { timestamp: "desc" },
        take: limit,
      });
      await prisma.conversation.update({ where: { id: chatId }, data: { unreadCount: 0 } });
      const ordered = messages.reverse();
      const quotedIds = [...new Set(ordered.map((message) => message.replyToExternalId).filter((id): id is string => !!id))];
      const quoted = quotedIds.length
        ? await prisma.channelMessage.findMany({
            where: { conversationId: chatId, externalMessageId: { in: quotedIds } },
            select: { externalMessageId: true, id: true, direction: true, body: true, caption: true, messageType: true },
          })
        : [];
      const quotedById = new Map(quoted.map((message) => [message.externalMessageId, message]));
      return NextResponse.json(ordered.map((message) => ({
        ...message,
        wamid: message.externalMessageId,
        replyToWamid: message.replyToExternalId,
        replyTo: message.replyToExternalId ? quotedById.get(message.replyToExternalId) ?? null : null,
      })));
    }

    const messages = await prisma.wAMessage.findMany({
      where: { chatId, messageType: { not: "reaction" }, ...(beforeDate ? { timestamp: { lt: beforeDate } } : {}) },
      select: WA_MESSAGE_SELECT,
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    await prisma.wAChat.update({
      where: { id: chatId },
      data: { unreadCount: 0 },
    });

    const quotedIds = [...new Set(messages.map((message) => message.replyToWamid).filter((id): id is string => !!id))];
    const quoted = quotedIds.length
      ? await prisma.wAMessage.findMany({
          where: { chatId, wamid: { in: quotedIds } },
          select: { wamid: true, id: true, direction: true, body: true, caption: true, messageType: true },
        })
      : [];
    const quotedByWamid = new Map(quoted.map((message) => [message.wamid, message]));
    return NextResponse.json(messages.reverse().map((message) => ({
      ...message,
      replyTo: message.replyToWamid ? quotedByWamid.get(message.replyToWamid) ?? null : null,
    })));
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
