import { Prisma, type Channel } from "@prisma/client";
import { queuePush } from "@/lib/notifications/push";
import { afterContactCreated } from "@/lib/billing/contact-limits";
import { prisma } from "@/lib/prisma";
import { botQueue, mediaDownloadQueue } from "@/lib/queue";
import { shouldUpdateName } from "@/lib/whatsapp/contact-name";
import { autoAssignConversation } from "./auto-assign";
import { BOT_REPLY_DEBOUNCE_MS } from "@/lib/bots/guards";
import { emitDomainEvent } from "@/lib/events/emit";
import { dispatchInboundMessage } from "@/lib/automations/dispatch";
import { markWaiting } from "@/lib/chats/waiting";
import { queueAwayMessage } from "@/lib/inbox/away-message";

// Equivalente a lib/whatsapp/ingest-message.ts pero sobre las tablas
// genéricas ChannelAccount/Conversation/ChannelMessage — mismos pasos
// (dedup, upsert Contact/Conversation, create mensaje, notificación,
// auto-assign, enqueue de bot), sin tocar el pipeline real de WhatsApp.
export interface NormalizedChannelMessage {
  externalId: string; // chat_id de Telegram — equivalente a remoteJid
  externalMessageId: string | null;
  timestamp: Date;
  type: string;
  body: string;
  // Telegram trae el nombre inline en cada mensaje (string). Messenger/
  // Instagram no lo mandan en el webhook — el llamador pasa un callback que
  // solo se invoca (GET /{psid}?fields=name) cuando el contacto es
  // realmente nuevo, para no pegarle a la Graph API en cada mensaje de una
  // conversación ya conocida.
  contactName: string | (() => Promise<string>);
  isGroup: boolean;
  mediaId?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  caption?: string | null;
  bytesSize?: number | null;
  // Roadmap P3-c — true si este INBOUND viene de un comentario de Facebook
  // Page (webhook `feed`), no de un DM. Se persiste en ChannelMessage y
  // suprime el enqueue de bots más abajo: el pipeline de respuesta
  // automática (bot-worker) manda por el Send API normal, que Meta rechaza
  // para un contacto que solo comentó y nunca abrió un DM — la primera
  // respuesta necesita el mecanismo de private reply, que solo dispara un
  // agente humano desde la UI (ver sendMetaChannelReply en
  // chats/[chatId]/send). Queda para una iteración futura enseñarle esto al
  // bot-worker si se decide automatizar.
  isFromComment?: boolean;
  // Id de la opción elegida al tocar un botón (callback_data de Telegram,
  // quick_reply.payload de Messenger/Instagram, replyId del widget web).
  interactiveReplyId?: string | null;
  replyToExternalId?: string | null;
}

export interface IngestChannelResult {
  messageId: string;
  conversationId: string;
}

export async function ingestChannelMessage(
  channelAccountId: string,
  channel: Channel,
  msg: NormalizedChannelMessage
): Promise<IngestChannelResult | null> {
  const [existingContact, existingConversation] = await Promise.all([
    prisma.contact.findUnique({
      where: { channelAccountId_remoteJid: { channelAccountId, remoteJid: msg.externalId } },
      select: { name: true },
    }),
    prisma.conversation.findUnique({
      where: { channelAccountId_externalId: { channelAccountId, externalId: msg.externalId } },
      select: { id: true, name: true },
    }),
  ]);

  // El dedup va acotado a la conversación, no a la cuenta: a diferencia del
  // `wamid` de Meta (único global), el `message_id` de Telegram es único POR
  // CHAT y arranca en 1 en cada conversación nueva. Buscarlo en toda la cuenta
  // descartaba como "duplicado" el mensaje N de un chat recién abierto solo
  // porque otro chat del mismo bot ya había usado ese número — es decir, el
  // segundo contacto en adelante perdía sus primeros mensajes. Este filtro
  // refleja el constraint real: @@unique([conversationId, externalMessageId]).
  // Si la conversación aún no existe, no puede haber duplicado que buscar.
  if (existingConversation && msg.externalMessageId) {
    const existing = await prisma.channelMessage.findFirst({
      where: { conversationId: existingConversation.id, externalMessageId: msg.externalMessageId },
      select: { id: true },
    });
    if (existing) return null;
  }

  // Solo se resuelve el callback (llamada real a la Graph API) en el primer
  // touch — ni Contact ni Conversation existen todavía. En mensajes
  // siguientes de un contacto ya conocido no vale la pena pedir el nombre
  // de nuevo; se deja el nombre existente tal cual (sin candidato = sin
  // actualización).
  const isFirstTouch = !existingContact && !existingConversation;
  const nameCandidate: string | null =
    typeof msg.contactName === "string"
      ? msg.contactName
      : isFirstTouch
        ? await msg.contactName()
        : null;
  // Nombre a mostrar en la notificación de abajo — a diferencia del
  // candidato de arriba, aquí sí hay fallback al nombre ya conocido (no
  // amerita una llamada a la Graph API solo para un título de notificación).
  const displayName = nameCandidate ?? existingContact?.name ?? existingConversation?.name ?? msg.externalId;

  const contactNameShouldUpdate = nameCandidate ? shouldUpdateName(nameCandidate, existingContact?.name, msg.externalId) : false;
  const conversationNameShouldUpdate = nameCandidate ? shouldUpdateName(nameCandidate, existingConversation?.name, msg.externalId) : false;

  const contactRecord = await prisma.contact.upsert({
    where: { channelAccountId_remoteJid: { channelAccountId, remoteJid: msg.externalId } },
    create: { channelAccountId, remoteJid: msg.externalId, name: nameCandidate ?? msg.externalId },
    update: contactNameShouldUpdate ? { name: nameCandidate! } : {},
  });
  if (!existingContact) await afterContactCreated({ channelAccountId }, contactRecord.id);

  const conversation = await prisma.conversation.upsert({
    where: { channelAccountId_externalId: { channelAccountId, externalId: msg.externalId } },
    create: {
      channelAccountId,
      externalId: msg.externalId,
      name: nameCandidate ?? msg.externalId,
      isGroup: msg.isGroup,
      lastMessage: msg.body.slice(0, 500),
      lastMessageAt: msg.timestamp,
      unreadCount: 1,
      contactId: contactRecord.id,
    },
    update: {
      ...(conversationNameShouldUpdate ? { name: nameCandidate! } : {}),
      isGroup: msg.isGroup,
      lastMessage: msg.body.slice(0, 500),
      lastMessageAt: msg.timestamp,
      unreadCount: { increment: 1 },
      contactId: contactRecord.id,
    },
  });

  // Mismo criterio que lib/whatsapp/ingest-message.ts: un mensaje nuevo
  // reabre una conversación RESUELTA.
  if (conversation.status === "RESOLVED" || conversation.snoozedUntil) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        ...(conversation.status === "RESOLVED" ? { status: "OPEN" as const, resolvedAt: null } : {}),
        snoozedUntil: null,
      },
    });
  }

  let createdMessage;
  try {
    createdMessage = await prisma.channelMessage.create({
      data: {
        externalMessageId: msg.externalMessageId,
        conversationId: conversation.id,
        direction: "INBOUND",
        messageType: msg.type,
        body: msg.body,
        caption: msg.caption ?? null,
        mediaId: msg.mediaId ?? null,
        mimeType: msg.mimeType ?? null,
        filename: msg.filename ?? null,
        bytesSize: msg.bytesSize ?? null,
        isFromComment: msg.isFromComment ?? false,
        interactivePayload: msg.interactiveReplyId ? { replyId: msg.interactiveReplyId } : undefined,
        replyToExternalId: msg.replyToExternalId ?? null,
        timestamp: msg.timestamp,
      },
    });
  } catch (err) {
    // Carrera entre entregas duplicadas del webhook — mismo criterio que
    // ingest-message.ts de WhatsApp: tratarlo como dedupe, no como 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return null;
    }
    throw err;
  }

  // Ver lib/chats/waiting.ts (mismo criterio que el ingest de WhatsApp).
  await markWaiting("channel", conversation.id, msg.timestamp);

  if (msg.mediaId && msg.type !== "text") {
    await mediaDownloadQueue
      .add("download-media", {
        channel,
        messageId: createdMessage.id,
        accountId: channelAccountId,
        mediaId: msg.mediaId,
      })
      .catch((err) => {
        console.error(`[${channel.toLowerCase()} ingest] media-download enqueue failed:`, err);
      });
  }

  let assignedToId = conversation.assignedToId;
  const autoAssigned = !assignedToId;
  if (!assignedToId) {
    assignedToId = await autoAssignConversation(channelAccountId, conversation.id);
  }

  // Eventos de dominio — mismo criterio que lib/whatsapp/ingest-message.ts.
  const refs = {
    account: { kind: "channel" as const, id: channelAccountId, channel },
    chat: { kind: "channel" as const, id: conversation.id },
    contactId: contactRecord.id,
  };
  if (!existingContact) {
    await emitDomainEvent({ type: "contact.created", ...refs, data: { origin: contactRecord.leadOrigin, source: "inbound" } }, msg.timestamp);
  }
  await emitDomainEvent(
    {
      type: "message.received",
      ...refs,
      data: { messageId: createdMessage.id, messageType: msg.type, text: msg.body || null, interactiveReplyId: msg.interactiveReplyId ?? null },
    },
    msg.timestamp
  );
  if (autoAssigned && assignedToId) {
    await emitDomainEvent({ type: "conversation.assigned", ...refs, data: { assignedToId, auto: true } });
  }

  if (assignedToId) {
    await prisma.notification.create({
      data: {
        userId: assignedToId,
        type: "CHAT_MESSAGE",
        title: displayName,
        body: msg.body.slice(0, 200),
        // La misma ruta de deep-link sirve para ambos canales — no valida
        // que accountId sea un WAAccount, solo preselecciona el chat.
        link: `/whatsapp/chat/${channelAccountId}/${conversation.id}`,
      },
    });
    await queuePush(assignedToId, { title: displayName, body: msg.body, link: `/whatsapp/chat/${channelAccountId}/${conversation.id}`, tag: `chat:${conversation.id}` });
  }

  await prisma.channelAccount.update({
    where: { id: channelAccountId },
    data: { lastActivity: new Date() },
  });

  // Ver comentario de isFromComment arriba — un bot autónomo respondería por
  // el Send API normal, que Meta rechaza sin un hilo ya abierto.
  // Un solo bot por cuenta + retraso para agrupar ráfagas — mismo criterio que
  // lib/whatsapp/ingest-message.ts (ver lib/bots/guards.ts).
  // Automatizaciones antes que el bot — mismo criterio que la ingesta de
  // WhatsApp. Un fallo del motor no debe dejar al lead sin bot.
  const { suppressBot } = await dispatchInboundMessage({
    account: refs.account,
    chat: refs.chat,
    contactId: contactRecord.id,
    text: msg.body,
    replyId: msg.interactiveReplyId ?? null,
    isFirstMessage: !existingConversation,
  }).catch((err) => {
    console.error(`[${channel.toLowerCase()} ingest] dispatchInboundMessage falló:`, err);
    return { suppressBot: false };
  });

  const activeBot = msg.isFromComment || suppressBot
    ? null
    : await prisma.wABot.findFirst({
        where: { channelAccountId, isActive: true, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });

  if (activeBot) {
    await botQueue.add("process-message", {
      botId: activeBot.id,
      channel,
      conversationId: conversation.id,
      incomingMessage: msg.body,
      messageId: createdMessage.id,
      messageType: msg.type,
      mediaId: msg.mediaId ?? null,
      mimeType: msg.mimeType ?? null,
      caption: msg.caption ?? null,
      filename: msg.filename ?? null,
    }, { delay: BOT_REPLY_DEBOUNCE_MS });
  } else if (!suppressBot) {
    // Sin bot ni flujo que conteste: aviso fuera de horario si la organización
    // lo activó (lib/inbox/away-message.ts decide y vuelve a comprobar todo).
    await queueAwayMessage("channel", conversation.id, channelAccountId, { isGroup: msg.isGroup, isFromComment: msg.isFromComment });
  }

  return { messageId: createdMessage.id, conversationId: conversation.id };
}
