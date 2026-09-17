import { Prisma, type Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { botQueue, mediaDownloadQueue } from "@/lib/queue";
import { shouldUpdateName } from "@/lib/whatsapp/contact-name";
import { autoAssignConversation } from "./auto-assign";
import { BOT_REPLY_DEBOUNCE_MS } from "@/lib/bots/guards";

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
  if (!assignedToId) {
    assignedToId = await autoAssignConversation(channelAccountId, conversation.id);
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
  }

  await prisma.channelAccount.update({
    where: { id: channelAccountId },
    data: { lastActivity: new Date() },
  });

  // Ver comentario de isFromComment arriba — un bot autónomo respondería por
  // el Send API normal, que Meta rechaza sin un hilo ya abierto.
  // Un solo bot por cuenta + retraso para agrupar ráfagas — mismo criterio que
  // lib/whatsapp/ingest-message.ts (ver lib/bots/guards.ts).
  const activeBot = msg.isFromComment
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
  }

  return { messageId: createdMessage.id, conversationId: conversation.id };
}
