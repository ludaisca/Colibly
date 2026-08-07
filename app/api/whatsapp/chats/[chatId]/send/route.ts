import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMessageSchema, telegramSendMessageSchema, metaChannelSendMessageSchema, webchatAgentSendSchema } from "@/lib/validations";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { sendInteractiveMessage } from "@/lib/whatsapp/send-interactive";
import { sendTelegramMessage, sendTelegramMedia } from "@/lib/telegram/send";
import { sendMetaChannelText, sendMetaChannelMedia, sendMetaChannelPrivateReply } from "@/lib/meta-messaging/send";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { rateLimit } from "@/lib/rate-limit";
import { resolveAbsolutePath } from "@/lib/whatsapp/media-store";
import fs from "fs/promises";

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
    if (resolved.channel === "MESSENGER" || resolved.channel === "INSTAGRAM") {
      return sendMetaChannelReply(resolved.channel, req, chatId, session.user.id);
    }
    if (resolved.channel === "WEBCHAT") {
      return sendWebchatReply(req, chatId, session.user.id);
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

    const { type, body: textBody, mediaId, caption, mimeType, filename, localMediaPath, bytesSize, buttons } = parsed.data;

    let result: { wamid: string | null };
    let interactivePayload: { buttons: { id: string; title: string }[] } | undefined;

    if (type === "interactive") {
      const idButtons = buttons!.map((b, i) => ({ id: `btn_${i + 1}`, title: b.title }));
      result = await sendInteractiveMessage(chat.account, {
        to: chat.remoteJid,
        body: textBody!,
        buttons: idButtons,
      });
      interactivePayload = { buttons: idButtons };
    } else {
      result = await sendWhatsAppMessage(chat.account, {
        to: chat.remoteJid,
        type,
        body: textBody,
        mediaId,
        caption,
        mimeType,
        filename,
        localMediaPath,
      });
    }

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
        interactivePayload,
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

  const { type, body: textBody, caption, mimeType, filename, localMediaPath, bytesSize } = parsed.data;

  let externalMessageId: string | null;
  let mediaId: string | null = null;

  if (type === "text") {
    const result = await sendTelegramMessage(conversation.channelAccount, {
      to: conversation.externalId,
      body: textBody!,
    });
    externalMessageId = result.externalMessageId;
  } else {
    const buffer = await fs.readFile(resolveAbsolutePath(localMediaPath!));
    const result = await sendTelegramMedia(conversation.channelAccount, {
      to: conversation.externalId,
      type,
      buffer,
      filename: filename ?? `media-${Date.now()}`,
      mimeType: mimeType ?? "application/octet-stream",
      caption: textBody,
    });
    externalMessageId = result.externalMessageId;
    mediaId = result.fileId;
  }

  const now = new Date();
  const lastMessagePreview = textBody ?? caption ?? `[${type}]`;

  const newMessage = await prisma.channelMessage.create({
    data: {
      externalMessageId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      messageType: type,
      body: type === "text" ? textBody : null,
      caption: type === "text" ? null : (caption ?? null),
      mediaId,
      mediaUrl: type === "text" ? null : (localMediaPath ?? null),
      mimeType: type === "text" ? null : (mimeType ?? null),
      filename: type === "text" ? null : (filename ?? null),
      bytesSize: type === "text" ? null : (bytesSize ?? null),
      status: "sent",
      senderId: userId,
      timestamp: now,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessage: lastMessagePreview.slice(0, 500),
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

// Roadmap P3-f — a diferencia de los demás canales, no hay ninguna API
// externa a la que llamar: el widget recoge la respuesta por polling (ver
// GET /api/webchat/[accountId]/messages), así que "enviar" es solo
// persistir el ChannelMessage OUTBOUND. MVP solo texto (sin medios).
async function sendWebchatReply(req: Request, chatId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: chatId, channelAccount: { userId } },
    include: { channelAccount: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
  }

  const isFirstResponse = conversation.firstResponseAt === null;

  const body = await req.json();
  const parsed = webchatAgentSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const now = new Date();

  const newMessage = await prisma.channelMessage.create({
    data: {
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

// Mismo shape que sendTelegramReply — la única diferencia real con Telegram
// es el two-step de subida de adjuntos (sendMetaChannelMedia ya lo resuelve
// internamente) y que el `where` de la Conversation filtra también por
// `channel`, porque Messenger e Instagram son dos ChannelAccount.channel
// distintos que de otro modo colisionarían con el mismo userId.
async function sendMetaChannelReply(channel: "MESSENGER" | "INSTAGRAM", req: Request, chatId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: chatId, channelAccount: { userId, channel } },
    include: { channelAccount: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
  }

  const isFirstResponse = conversation.firstResponseAt === null;

  const body = await req.json();
  const parsed = metaChannelSendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { type, body: textBody, caption, mimeType, filename, localMediaPath, bytesSize } = parsed.data;

  let externalMessageId: string | null;
  let attachmentId: string | null = null;

  // Roadmap P3-c — si la conversación arrancó de un comentario (no de un
  // DM) y todavía no se le ha mandado NADA (isFirstResponse), el Send API
  // normal falla: Meta exige un hilo de Messenger ya abierto. El endpoint de
  // private reply usa el comment_id del último INBOUND como destinatario en
  // vez del PSID — solo aplica a esa primera respuesta; una vez que existe,
  // Meta trata la conversación como un hilo normal y las respuestas
  // siguientes van por sendMetaChannelText() de siempre (isFirstResponse ya
  // será false).
  const originComment = isFirstResponse && channel === "MESSENGER" && type === "text"
    ? await prisma.channelMessage.findFirst({
        where: { conversationId: conversation.id, direction: "INBOUND", isFromComment: true },
        orderBy: { timestamp: "desc" },
        select: { externalMessageId: true },
      })
    : null;

  if (originComment?.externalMessageId) {
    const result = await sendMetaChannelPrivateReply(conversation.channelAccount, {
      commentId: originComment.externalMessageId,
      body: textBody!,
    });
    externalMessageId = result.externalMessageId;
  } else if (type === "text") {
    const result = await sendMetaChannelText(conversation.channelAccount, {
      to: conversation.externalId,
      body: textBody!,
    });
    externalMessageId = result.externalMessageId;
  } else {
    const buffer = await fs.readFile(resolveAbsolutePath(localMediaPath!));
    const result = await sendMetaChannelMedia(conversation.channelAccount, {
      to: conversation.externalId,
      buffer,
      filename: filename ?? `media-${Date.now()}`,
      mimeType: mimeType ?? "application/octet-stream",
    });
    externalMessageId = result.externalMessageId;
    attachmentId = result.attachmentId;
  }

  const now = new Date();
  const lastMessagePreview = textBody ?? caption ?? `[${type}]`;

  const newMessage = await prisma.channelMessage.create({
    data: {
      externalMessageId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      messageType: type,
      body: type === "text" ? textBody : null,
      caption: type === "text" ? null : (caption ?? null),
      mediaId: attachmentId,
      mediaUrl: type === "text" ? null : (localMediaPath ?? null),
      mimeType: type === "text" ? null : (mimeType ?? null),
      filename: type === "text" ? null : (filename ?? null),
      bytesSize: type === "text" ? null : (bytesSize ?? null),
      status: "sent",
      senderId: userId,
      timestamp: now,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessage: lastMessagePreview.slice(0, 500),
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
