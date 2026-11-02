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
  transcript: true,
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

const AROUND_OLDER = 25;
const AROUND_MAX_NEWER = 500;
const TOO_FAR_MESSAGE = "El mensaje es muy antiguo para saltar directo; usa «Ver mensajes anteriores» en el chat.";

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
    // around=<messageId>: salto desde la búsqueda. Devuelve los 25 anteriores
    // y TODOS los posteriores (hasta AROUND_MAX_NEWER), así el poll de 5 s,
    // que trae los últimos 50, nunca deja un hueco en el hilo. Si el mensaje
    // está más lejos que eso, 422 `too_far` y el cliente abre el chat normal.
    const around = searchParams.get("around");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

    let beforeDate: Date | undefined;
    if (before) {
      beforeDate = new Date(before);
      if (isNaN(beforeDate.getTime())) {
        return NextResponse.json({ error: "Parámetro 'before' inválido" }, { status: 400 });
      }
    }

    if (resolved.channel !== "WHATSAPP") {
      let ordered;
      if (around) {
        const pivot = await prisma.channelMessage.findFirst({ where: { id: around, conversationId: chatId }, select: { timestamp: true } });
        if (!pivot) return NextResponse.json({ error: "Mensaje no encontrado en este chat" }, { status: 404 });
        const newer = await prisma.channelMessage.count({ where: { conversationId: chatId, timestamp: { gt: pivot.timestamp } } });
        if (newer > AROUND_MAX_NEWER) return NextResponse.json({ error: TOO_FAR_MESSAGE, code: "too_far" }, { status: 422 });
        const [older, rest] = await Promise.all([
          prisma.channelMessage.findMany({ where: { conversationId: chatId, timestamp: { lt: pivot.timestamp } }, select: CHANNEL_MESSAGE_SELECT, orderBy: { timestamp: "desc" }, take: AROUND_OLDER }),
          prisma.channelMessage.findMany({ where: { conversationId: chatId, timestamp: { gte: pivot.timestamp } }, select: CHANNEL_MESSAGE_SELECT, orderBy: { timestamp: "asc" } }),
        ]);
        ordered = [...older.reverse(), ...rest];
      } else {
        const messages = await prisma.channelMessage.findMany({
          where: { conversationId: chatId, ...(beforeDate ? { timestamp: { lt: beforeDate } } : {}) },
          select: CHANNEL_MESSAGE_SELECT,
          orderBy: { timestamp: "desc" },
          take: limit,
        });
        ordered = messages.reverse();
      }
      await prisma.conversation.update({ where: { id: chatId }, data: { unreadCount: 0 } });
      const quotedIds = [...new Set(ordered.map((message) => message.replyToExternalId).filter((id): id is string => !!id))];
      const quoted = quotedIds.length
        ? await prisma.channelMessage.findMany({
            where: { conversationId: chatId, externalMessageId: { in: quotedIds } },
            select: { externalMessageId: true, id: true, direction: true, body: true, caption: true, messageType: true, filename: true, mediaUrl: true },
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

    let messages;
    if (around) {
      const pivot = await prisma.wAMessage.findFirst({ where: { id: around, chatId }, select: { timestamp: true } });
      if (!pivot) return NextResponse.json({ error: "Mensaje no encontrado en este chat" }, { status: 404 });
      const newer = await prisma.wAMessage.count({ where: { chatId, messageType: { not: "reaction" }, timestamp: { gt: pivot.timestamp } } });
      if (newer > AROUND_MAX_NEWER) return NextResponse.json({ error: TOO_FAR_MESSAGE, code: "too_far" }, { status: 422 });
      const [older, rest] = await Promise.all([
        prisma.wAMessage.findMany({ where: { chatId, messageType: { not: "reaction" }, timestamp: { lt: pivot.timestamp } }, select: WA_MESSAGE_SELECT, orderBy: { timestamp: "desc" }, take: AROUND_OLDER }),
        prisma.wAMessage.findMany({ where: { chatId, messageType: { not: "reaction" }, timestamp: { gte: pivot.timestamp } }, select: WA_MESSAGE_SELECT, orderBy: { timestamp: "desc" } }),
      ]);
      // Mismo orden que la rama normal (desc): se invierte abajo.
      messages = [...rest, ...older];
    } else {
      messages = await prisma.wAMessage.findMany({
        where: { chatId, messageType: { not: "reaction" }, ...(beforeDate ? { timestamp: { lt: beforeDate } } : {}) },
        select: WA_MESSAGE_SELECT,
        orderBy: { timestamp: "desc" },
        take: limit,
      });
    }

    await prisma.wAChat.update({
      where: { id: chatId },
      data: { unreadCount: 0 },
    });

    const quotedIds = [...new Set(messages.map((message) => message.replyToWamid).filter((id): id is string => !!id))];
    const quoted = quotedIds.length
      ? await prisma.wAMessage.findMany({
          where: { chatId, wamid: { in: quotedIds } },
          select: { wamid: true, id: true, direction: true, body: true, caption: true, messageType: true, filename: true, mediaUrl: true },
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
