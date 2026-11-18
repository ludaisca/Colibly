import { NextResponse } from "next/server";
import { appendSignature } from "@/lib/inbox/signature";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMessageSchema, telegramSendMessageSchema, metaChannelSendMessageSchema, webchatAgentSendSchema } from "@/lib/validations";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { sendInteractiveMessage } from "@/lib/whatsapp/send-interactive";
import { sendTelegramMessage, sendTelegramMedia } from "@/lib/telegram/send";
import { sendGowaMessage, sendGowaMedia, GowaChannelDisabledError } from "@/lib/gowa/send";
import { GowaError } from "@/lib/gowa/client";
import { sendMetaChannelMedia } from "@/lib/meta-messaging/send";
import { CommentReplyBlockedError, assertMetaMediaAllowed, sendMetaDirectText, sendMetaPublicReply, type CommentReplyColumns } from "@/lib/meta-messaging/comment-reply";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { rateLimit } from "@/lib/rate-limit";
import { resolveAbsolutePath, isAccountMediaPath, mediaSha256Of } from "@/lib/whatsapp/media-store";
import fs from "fs/promises";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { publicErrorMessage } from "@/lib/api-errors";
import { MetaSendError } from "@/lib/whatsapp/send-errors";
import { emitMessageSent } from "@/lib/events/message-sent";
import { eventRefsForChat } from "@/lib/events/refs";
import { pauseConversationalRuns } from "@/lib/automations/dispatch";
import { uploadMedia } from "@/lib/whatsapp";
import { decrypt } from "@/lib/crypto";
import { saveMediaFromBuffer } from "@/lib/whatsapp/media-store";
import { isWithinServiceWindow } from "@/lib/whatsapp/lead-recovery";
import { assertOrgCanSend } from "@/lib/billing/gates";
import { getDisplayNameState } from "@/lib/whatsapp/display-name";

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

    // WhatsApp por QR comparte el flujo de Telegram (texto/medios, cita, sin
    // ventana de 24 h); solo cambia el remitente.
    if (resolved.channel === "TELEGRAM" || resolved.channel === "WHATSAPP_WEB") {
      return await sendTelegramReply(req, chatId, session.user.id);
    }
    if (resolved.channel === "MESSENGER" || resolved.channel === "INSTAGRAM") {
      return await sendMetaChannelReply(resolved.channel, req, chatId, session.user.id);
    }
    if (resolved.channel === "WEBCHAT") {
      return await sendWebchatReply(req, chatId, session.user.id);
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

    const body = await req.json().catch(() => null);
    const parsed = sendMessageSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0].message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { type, body: rawTextBody, caption, buttons, replyToMessageId, stickerId } = parsed.data;
    // Firma solo en texto escrito a mano: nunca en botones, plantillas ni media.
    const textBody = type === "text" ? await signText(session.user.id, rawTextBody, 4096) : rawTextBody;
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
    // Solo bloquea cuando Meta confirmó que el nombre no está aprobado. Si la
    // consulta falló ("unknown") se intenta el envío: Meta responderá con el
    // motivo real (131037) en vez de culpar al nombre por un timeout.
    if (replyTarget?.wamid && (await getDisplayNameState(chat.account)) === "not_approved") {
      return NextResponse.json(
        { error: "Citar un mensaje se habilita cuando Meta apruebe el nombre para mostrar de este número. Envía el texto sin citar." },
        { status: 422 }
      );
    }

    // Ventana de 24 h de Meta (misma regla que lib/messaging/outbound.ts): fuera
    // de ella Meta acepta el envío (devuelve wamid) y después lo marca "failed"
    // por webhook (131047), así que la bandeja mostraba un fallo sin motivo.
    // Cuenta cualquier mensaje entrante, también los importados del historial.
    const lastInbound = await prisma.wAMessage.findFirst({
      where: { chatId: chat.id, direction: "INBOUND" },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });
    if (!lastInbound || !isWithinServiceWindow(lastInbound.timestamp, new Date())) {
      return NextResponse.json(
        {
          error: lastInbound
            ? "Pasaron más de 24 h desde el último mensaje de este cliente: WhatsApp solo permite enviarle una plantilla aprobada (Campañas) hasta que vuelva a escribir."
            : "Este cliente todavía no te ha escrito: WhatsApp solo permite iniciar la conversación con una plantilla aprobada (Campañas).",
          code: "window_closed",
        },
        { status: 422 }
      );
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
        sentVia: "agent",
        messageType: type,
        body: textBody ?? null,
        caption: caption ?? null,
        mediaId,
        mediaUrl: localMediaPath ?? null,
        mimeType,
        filename,
        bytesSize,
        mediaSha256: await mediaSha256Of(localMediaPath),
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
        // Respuesta de una persona: el cliente ya no espera (lib/chats/waiting.ts).
        waitingSince: null,
        ...(isFirstResponse ? { firstResponseAt: now } : {}),
      },
    });

    await prisma.wAAccount.update({
      where: { id: chat.account.id },
      data: { lastActivity: now },
    });

    await emitAgentMessageSent(chat.id, newMessage);

    if (type === "sticker" && stickerId) await prisma.wASticker.updateMany({ where: { id: stickerId, organizationId: chat.account.organizationId }, data: { lastUsedAt: now } });

    return NextResponse.json(newMessage);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    // Meta (p. ej. 131037) o WhatsApp vía GoWA rechazó el envío: no es un fallo nuestro.
    return NextResponse.json({ error: message }, { status: error instanceof MetaSendError || error instanceof GowaError ? 422 : 500 });
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

  const body = await req.json().catch(() => null);
  const parsed = telegramSendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { type, body: rawTextBody, caption, mimeType, filename, localMediaPath, bytesSize, replyToMessageId } = parsed.data;
  const textBody = type === "text" ? await signText(userId, rawTextBody, 4096) : rawTextBody;
  if (localMediaPath && !isAccountMediaPath(localMediaPath, conversation.channelAccountId)) {
    return NextResponse.json({ error: "Archivo no válido para esta cuenta" }, { status: 400 });
  }

  let replyToExternalId: string | null = null;
  if (replyToMessageId) {
    const target = await prisma.channelMessage.findFirst({
      where: { id: replyToMessageId, conversationId: conversation.id, externalMessageId: { not: null } },
      select: { externalMessageId: true },
    });
    const isTelegram = conversation.channelAccount.channel === "TELEGRAM";
    if (!target?.externalMessageId || (isTelegram && !/^\d+$/.test(target.externalMessageId))) {
      return NextResponse.json({ error: "Ese mensaje no se puede citar" }, { status: 400 });
    }
    replyToExternalId = target.externalMessageId;
  }

  let externalMessageId: string | null;
  let mediaId: string | null = null;
  const viaGowa = conversation.channelAccount.channel === "WHATSAPP_WEB";

  try {
    if (type === "text") {
      const params = { to: conversation.externalId, body: textBody!, replyToMessageId: replyToExternalId ?? undefined };
      const result = viaGowa
        ? await sendGowaMessage(conversation.channelAccount, params)
        : await sendTelegramMessage(conversation.channelAccount, params);
      externalMessageId = result.externalMessageId;
    } else {
      const buffer = await fs.readFile(resolveAbsolutePath(localMediaPath!));
      const params = {
        to: conversation.externalId,
        type,
        buffer,
        filename: filename ?? `media-${Date.now()}`,
        mimeType: mimeType ?? "application/octet-stream",
        caption: textBody,
        replyToMessageId: replyToExternalId ?? undefined,
      };
      if (viaGowa) {
        externalMessageId = (await sendGowaMedia(conversation.channelAccount, params)).externalMessageId;
      } else {
        const result = await sendTelegramMedia(conversation.channelAccount, params);
        externalMessageId = result.externalMessageId;
        mediaId = result.fileId;
      }
    }
  } catch (error) {
    if (error instanceof GowaChannelDisabledError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    throw error;
  }

  const now = new Date();
  const lastMessagePreview = textBody ?? caption ?? `[${type}]`;

  const newMessage = await prisma.channelMessage.create({
    data: {
      externalMessageId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sentVia: "agent",
      messageType: type,
      body: type === "text" ? textBody : null,
      caption: type === "text" ? null : (caption ?? null),
      mediaId,
      mediaUrl: type === "text" ? null : (localMediaPath ?? null),
      mimeType: type === "text" ? null : (mimeType ?? null),
      filename: type === "text" ? null : (filename ?? null),
      bytesSize: type === "text" ? null : (bytesSize ?? null),
      mediaSha256: type === "text" ? null : await mediaSha256Of(localMediaPath),
      status: "sent",
      senderId: userId,
      replyToExternalId,
      timestamp: now,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessage: lastMessagePreview.slice(0, 500),
      lastMessageAt: now,
      // Respuesta de una persona: el cliente ya no espera (lib/chats/waiting.ts).
      waitingSince: null,
      ...(isFirstResponse ? { firstResponseAt: now } : {}),
    },
  });

  await prisma.channelAccount.update({
    where: { id: conversation.channelAccount.id },
    data: { lastActivity: now },
  });

  await emitAgentMessageSent(conversation.id, newMessage);

  return NextResponse.json({ ...newMessage, wamid: newMessage.externalMessageId, replyToWamid: newMessage.replyToExternalId });
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

  const body = await req.json().catch(() => null);
  const parsed = webchatAgentSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const webchatText = (await signText(userId, parsed.data.body, 2000)) ?? parsed.data.body;

  const now = new Date();

  const newMessage = await prisma.channelMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sentVia: "agent",
      messageType: "text",
      body: webchatText,
      status: "sent",
      senderId: userId,
      timestamp: now,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessage: webchatText.slice(0, 500),
      lastMessageAt: now,
      // Respuesta de una persona: el cliente ya no espera (lib/chats/waiting.ts).
      waitingSince: null,
      ...(isFirstResponse ? { firstResponseAt: now } : {}),
    },
  });

  await prisma.channelAccount.update({
    where: { id: conversation.channelAccount.id },
    data: { lastActivity: now },
  });

  await emitAgentMessageSent(conversation.id, newMessage);

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

  const body = await req.json().catch(() => null);
  const parsed = metaChannelSendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { type, body: rawTextBody, caption, mimeType, filename, localMediaPath, bytesSize } = parsed.data;
  const textBody = type === "text" ? await signText(userId, rawTextBody, 2000) : rawTextBody;
  if (localMediaPath && !isAccountMediaPath(localMediaPath, conversation.channelAccountId)) {
    return NextResponse.json({ error: "Archivo no válido para esta cuenta" }, { status: 400 });
  }

  let externalMessageId: string | null;
  let attachmentId: string | null = null;

  // Messenger con comentarios: la respuesta privada, el DM normal o el bloqueo
  // (ventanas de Meta) los decide comment-reply.ts; "public" responde en la
  // publicación. Instagram y el resto de Messenger salen como siempre.
  let commentColumns: CommentReplyColumns = { commentReplyKind: null, replyToExternalId: null };
  try {
    if (parsed.data.commentReply === "public") {
      const result = await sendMetaPublicReply(conversation, textBody!);
      externalMessageId = result.externalMessageId;
      commentColumns = result;
    } else if (type === "text") {
      const result = await sendMetaDirectText(conversation, { text: textBody! });
      externalMessageId = result.externalMessageId;
      commentColumns = result;
    } else {
      await assertMetaMediaAllowed(conversation);
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
  } catch (err) {
    if (err instanceof CommentReplyBlockedError) return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    throw err;
  }

  const now = new Date();
  const lastMessagePreview = textBody ?? caption ?? `[${type}]`;

  const newMessage = await prisma.channelMessage.create({
    data: {
      externalMessageId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sentVia: "agent",
      messageType: type,
      body: type === "text" ? textBody : null,
      caption: type === "text" ? null : (caption ?? null),
      mediaId: attachmentId,
      mediaUrl: type === "text" ? null : (localMediaPath ?? null),
      mimeType: type === "text" ? null : (mimeType ?? null),
      filename: type === "text" ? null : (filename ?? null),
      bytesSize: type === "text" ? null : (bytesSize ?? null),
      mediaSha256: type === "text" ? null : await mediaSha256Of(localMediaPath),
      commentReplyKind: commentColumns.commentReplyKind,
      replyToExternalId: commentColumns.replyToExternalId,
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
      // Respuesta de una persona: el cliente ya no espera (lib/chats/waiting.ts).
      waitingSince: null,
      ...(isFirstResponse ? { firstResponseAt: now } : {}),
    },
  });

  await prisma.channelAccount.update({
    where: { id: conversation.channelAccount.id },
    data: { lastActivity: now },
  });

  await emitAgentMessageSent(conversation.id, newMessage);

  return NextResponse.json(newMessage);
}

// Evento de dominio de un envío manual — común a las 4 ramas de canal.
async function emitAgentMessageSent(
  chatId: string,
  message: { id: string; messageType: string; body: string | null }
) {
  const refs = await eventRefsForChat(chatId);
  if (!refs) return;
  // Un humano tomó la conversación: las automatizaciones conversacionales de
  // este chat se pausan (se reanudan desde el chip del chat).
  if (refs.chat) {
    await pauseConversationalRuns(refs.chat).catch((err) => console.error("[send] pauseConversationalRuns falló:", err));
  }
  await emitMessageSent(refs.account.kind === "whatsapp" ? "whatsapp" : "channel", message.id, "agent");
}

// Firma personal del agente (F6, lib/inbox/signature.ts). El límite es el del
// canal: si el texto con firma no cabe, se manda sin firma.
async function signText(userId: string, text: string | undefined, maxLength: number): Promise<string | undefined> {
  if (!text) return text;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { messageSignature: true, signatureEnabled: true } });
  return appendSignature(text, user?.messageSignature, !!user?.signatureEnabled, maxLength);
}

