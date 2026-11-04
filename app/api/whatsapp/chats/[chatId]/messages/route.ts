import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";
import { jsonWithEtag } from "@/lib/http/etag";
import {
  CHANNEL_MESSAGE_SELECT,
  WA_MESSAGE_SELECT,
  loadLatestMessages,
  markChatRead,
  withChannelReplies,
  withWaReplies,
} from "@/lib/chats/messages";

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
    // y TODOS los posteriores (hasta AROUND_MAX_NEWER), así el poll, que trae
    // los últimos 50, nunca deja un hueco en el hilo. Si el mensaje está más
    // lejos que eso, 422 `too_far` y el cliente abre el chat normal.
    const around = searchParams.get("around");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

    let beforeDate: Date | undefined;
    if (before) {
      beforeDate = new Date(before);
      if (isNaN(beforeDate.getTime())) {
        return NextResponse.json({ error: "Parámetro 'before' inválido" }, { status: 400 });
      }
    }

    if (!around) {
      return jsonWithEtag(req, await loadLatestMessages(chatId, resolved.channel, { limit, before: beforeDate }));
    }

    if (resolved.channel !== "WHATSAPP") {
      const pivot = await prisma.channelMessage.findFirst({ where: { id: around, conversationId: chatId }, select: { timestamp: true } });
      if (!pivot) return NextResponse.json({ error: "Mensaje no encontrado en este chat" }, { status: 404 });
      const newer = await prisma.channelMessage.count({ where: { conversationId: chatId, timestamp: { gt: pivot.timestamp } } });
      if (newer > AROUND_MAX_NEWER) return NextResponse.json({ error: TOO_FAR_MESSAGE, code: "too_far" }, { status: 422 });
      const [older, rest] = await Promise.all([
        prisma.channelMessage.findMany({ where: { conversationId: chatId, timestamp: { lt: pivot.timestamp } }, select: CHANNEL_MESSAGE_SELECT, orderBy: { timestamp: "desc" }, take: AROUND_OLDER }),
        prisma.channelMessage.findMany({ where: { conversationId: chatId, timestamp: { gte: pivot.timestamp } }, select: CHANNEL_MESSAGE_SELECT, orderBy: { timestamp: "asc" } }),
      ]);
      await markChatRead(chatId, resolved.channel);
      return jsonWithEtag(req, await withChannelReplies(chatId, [...older.reverse(), ...rest]));
    }

    const pivot = await prisma.wAMessage.findFirst({ where: { id: around, chatId }, select: { timestamp: true } });
    if (!pivot) return NextResponse.json({ error: "Mensaje no encontrado en este chat" }, { status: 404 });
    const newer = await prisma.wAMessage.count({ where: { chatId, messageType: { not: "reaction" }, timestamp: { gt: pivot.timestamp } } });
    if (newer > AROUND_MAX_NEWER) return NextResponse.json({ error: TOO_FAR_MESSAGE, code: "too_far" }, { status: 422 });
    const [older, rest] = await Promise.all([
      prisma.wAMessage.findMany({ where: { chatId, messageType: { not: "reaction" }, timestamp: { lt: pivot.timestamp } }, select: WA_MESSAGE_SELECT, orderBy: { timestamp: "desc" }, take: AROUND_OLDER }),
      prisma.wAMessage.findMany({ where: { chatId, messageType: { not: "reaction" }, timestamp: { gte: pivot.timestamp } }, select: WA_MESSAGE_SELECT, orderBy: { timestamp: "asc" } }),
    ]);
    await markChatRead(chatId, resolved.channel);
    return jsonWithEtag(req, await withWaReplies(chatId, [...older.reverse(), ...rest]));
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
