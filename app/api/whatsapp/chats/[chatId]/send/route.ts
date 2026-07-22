import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMessageSchema, telegramSendMessageSchema } from "@/lib/validations";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`chat-send:${session.user.id}`, 30, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiados mensajes enviados, espera un momento" }, { status: 429 });
    }

    const { chatId } = await params;
    const resolved = await resolveChatChannel(chatId, session.user.id);
    if (!resolved) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    if (resolved.channel === "TELEGRAM") {
      return sendTelegramReply(req, chatId, session.user.id);
    }

    const chat = await prisma.wAChat.findFirst({
      where: {
        id: chatId,
        accountId: { in: resolved.accountIds },
      },
      include: { account: true },
    });

    if (!chat) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    const isFirstResponse = chat.firstResponseAt === null;

    const body = await req.json();
    const parsed = sendMessageSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0].message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { type, body: textBody, mediaId, caption, mimeType, filename, localMediaPath, bytesSize } = parsed.data;

    const result = await sendWhatsAppMessage(chat.account, {
      to: chat.remoteJid,
      type,
      body: textBody,
      mediaId,
      caption,
      mimeType,
      filename,
      localMediaPath,
    });

    const wamid = result.wamid ?? undefined;
    const now = new Date();

    const newMessage = await prisma.wAMessage.create({
      data: {
        wamid,
        chatId: chat.id,
        direction: "OUTBOUND",
        messageType: type,
        body: textBody ?? null,
        caption: caption ?? null,
        mediaId,
        mediaUrl: localMediaPath ?? null,
        mimeType,
        filename,
        bytesSize,
        status: "sent",
        senderId: session.user.id,
        timestamp: now,
      },
    });

    await prisma.wAChat.update({
      where: { id: chat.id },
      data: {
        lastMessage: textBody ?? caption ?? `[${type}]`,
        lastMessageAt: now,
        ...(isFirstResponse ? { firstResponseAt: now } : {}),
      },
    });

    await prisma.wAAccount.update({
      where: { id: chat.account.id },
      data: { lastActivity: now },
    });

    return NextResponse.json(newMessage);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Solo texto — el composer de chat-workspace.tsx llama a este mismo endpoint
// para ambos canales; el envío de media queda fuera de esta primera pasada
// de Telegram (ver "Fuera de alcance" en el plan), así que un intento de
// enviar type !== "text" simplemente no pasa la validación del schema.
async function sendTelegramReply(req: Request, chatId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: chatId, channelAccount: { userId } },
    include: { channelAccount: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
  }

  const isFirstResponse = conversation.firstResponseAt === null;

  const body = await req.json();
  const parsed = telegramSendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const result = await sendTelegramMessage(conversation.channelAccount, {
    to: conversation.externalId,
    body: parsed.data.body,
  });

  const now = new Date();

  const newMessage = await prisma.channelMessage.create({
    data: {
      externalMessageId: result.externalMessageId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      messageType: "text",
      body: parsed.data.body,
      status: "sent",
      senderId: userId,
      timestamp: now,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessage: parsed.data.body.slice(0, 500),
      lastMessageAt: now,
      ...(isFirstResponse ? { firstResponseAt: now } : {}),
    },
  });

  await prisma.channelAccount.update({
    where: { id: conversation.channelAccount.id },
    data: { lastActivity: now },
  });

  return NextResponse.json(newMessage);
}
