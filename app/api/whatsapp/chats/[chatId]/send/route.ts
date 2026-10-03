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
import { resolveAbsolutePath, isAccountMediaPath } from "@/lib/whatsapp/media-store";
import fs from "fs/promises";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { publicErrorMessage } from "@/lib/api-errors";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForChat } from "@/lib/events/refs";
import { pauseConversationalRuns } from "@/lib/automations/dispatch";
import { uploadMedia } from "@/lib/whatsapp";
import { decrypt } from "@/lib/crypto";
import { saveMediaFromBuffer } from "@/lib/whatsapp/media-store";
import { assertOrgCanSend } from "@/lib/billing/gates";

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

    const { type, body: textBody, caption, buttons, replyToMessageId, stickerId } = parsed.data;
    let { mediaId, mimeType, filename, localMediaPath, bytesSize } = parsed.data;
    if (localMediaPath && !isAccountMediaPath(localMediaPath, chat.accountId)) {
      return NextResponse.json({ error: "Archivo no válido para esta cuenta" }, { status: 400 });
    }

    let result: { wamid: string | null };
    let interactivePayload: { buttons: { id: string; title: string }[] } | undefined;
    const replyTarget = replyToMessageId
      ? await prisma.wAMessage.findFirst({
          where: { id: replyToMessageId, chatId: chat.id, wamid: { not: null } },
          select: { wamid: true },
        })
      : null;
    if (replyToMessageId && !replyTarget?.wamid) {
      return NextResponse.json({ error: "El mensaje citado ya no está disponible para responder" }, { status: 400 });
    }

    if (type === "sticker") {
      const sticker = await prisma.wASticker.findFirst({ where: { id: stickerId, organizationId: chat.account.organizationId } });
      if (!sticker) return NextResponse.json({ error: "Sticker no encontrado en tu organización" }, { status: 404 });
      await assertOrgCanSend(chat.account.organizationId);
      if (!chat.account.phoneNumberId || !chat.account.accessToken) return NextResponse.json({ error: "La cuenta de WhatsApp no está conectada" }, { status: 400 });
      const buffer = Buffer.from(sticker.data);
      const uploaded = await uploadMedia(chat.account.phoneNumberId, decrypt(chat.account.accessToken), buffer, "sticker.webp", "image/webp");
      const stored = await saveMediaFromBuffer(chat.accountId, buffer, "image/webp");
      mediaId = uploaded.id;
      localMediaPath = stored.relativePath;
      mimeType = "image/webp";
      filename = "sticker.webp";
      bytesSize = buffer.length;
    }

    if (type === "interactive") {
      const idButtons = buttons!.map((b, i) => ({ id: `btn_${i + 1}`, title: b.title }));
      result = await sendInteractiveMessage(chat.account, {
        to: chat.remoteJid,
        body: textBody!,
        buttons: idButtons,
        replyToWamid: replyTarget?.wamid ?? undefined,
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
        replyToWamid: replyTarget?.wamid ?? undefined,
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
        replyToWamid: replyTarget?.wamid ?? null,
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

    await emitAgentMessageSent(chat.id, newMessage, session.user.id);

    if (type === "sticker" && stickerId) await prisma.wASticker.updateMany({ where: { id: stickerId, organizationId: chat.account.organizationId }, data: { lastUsedAt: now } });

    return NextResponse.json(newMessage);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function sendTelegramReply(req: Request, chatId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: chatId, channelAccountId: { in: await getUserChannelAccountIds(userId) } },
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
  if (localMediaPath && !isAccountMediaPath(localMediaPath, conversation.channelAccountId)) {
    return NextResponse.json({ error: "Archivo no válido para esta cuenta" }, { status: 400 });
  }

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

  await emitAgentMessageSent(conversation.id, newMessage, userId);

  return NextResponse.json(newMessage);
}

// Roadmap P3-f — a diferencia de los demás canales, no hay ninguna API
// externa a la que llamar: el widget recoge la respuesta por polling (ver
// GET /api/webchat/[accountId]/messages), así que "enviar" es solo
// persistir el ChannelMessage OUTBOUND. MVP solo texto (sin medios).
async function sendWebchatReply(req: Request, chatId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: chatId, channelAccountId: { in: await getUserChannelAccountIds(userId) } },
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

  await emitAgentMessageSent(conversation.id, newMessage, userId);

  return NextResponse.json(newMessage);
}

// Mismo shape que sendTelegramReply — la única diferencia real con Telegram
// es el two-step de subida de adjuntos (sendMetaChannelMedia ya lo resuelve
// internamente) y que el `where` de la Conversation filtra también por
// `channel`, porque Messenger e Instagram son dos ChannelAccount.channel
// distintos que de otro modo colisionarían con el mismo userId.
async function sendMetaChannelReply(channel: "MESSENGER" | "INSTAGRAM", req: Request, chatId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: chatId, channelAccountId: { in: await getUserChannelAccountIds(userId) }, channelAccount: { channel } },
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
  if (localMediaPath && !isAccountMediaPath(localMediaPath, conversation.channelAccountId)) {
    return NextResponse.json({ error: "Archivo no válido para esta cuenta" }, { status: 400 });
  }

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

  await emitAgentMessageSent(conversation.id, newMessage, userId);

  return NextResponse.json(newMessage);
}

// Evento de dominio de un envío manual — común a las 4 ramas de canal.
async function emitAgentMessageSent(
  chatId: string,
  message: { id: string; messageType: string; body: string | null },
  userId: string
) {
  const refs = await eventRefsForChat(chatId);
  if (!refs) return;
  // Un humano tomó la conversación: las automatizaciones conversacionales de
  // este chat se pausan (se reanudan desde el chip del chat).
  if (refs.chat) {
    await pauseConversationalRuns(refs.chat).catch((err) => console.error("[send] pauseConversationalRuns falló:", err));
  }
  await emitDomainEvent({
    type: "message.sent",
    ...refs,
    data: { messageId: message.id, messageType: message.messageType, text: message.body, source: "agent", senderId: userId },
  });
}
