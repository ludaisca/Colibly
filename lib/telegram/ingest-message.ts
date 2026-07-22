import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { botQueue, mediaDownloadQueue } from "@/lib/queue";
import { shouldUpdateName } from "@/lib/whatsapp/contact-name";
import { autoAssignConversation } from "./auto-assign";

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
  contactName: string;
  isGroup: boolean;
  mediaId?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  caption?: string | null;
  bytesSize?: number | null;
}

export interface IngestChannelResult {
  messageId: string;
  conversationId: string;
}

export async function ingestChannelMessage(
  channelAccountId: string,
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

  const contactNameShouldUpdate = shouldUpdateName(msg.contactName, existingContact?.name, msg.externalId);
  const conversationNameShouldUpdate = shouldUpdateName(msg.contactName, existingConversation?.name, msg.externalId);

  const contactRecord = await prisma.contact.upsert({
    where: { channelAccountId_remoteJid: { channelAccountId, remoteJid: msg.externalId } },
    create: { channelAccountId, remoteJid: msg.externalId, name: msg.contactName },
    update: contactNameShouldUpdate ? { name: msg.contactName } : {},
  });

  const conversation = await prisma.conversation.upsert({
    where: { channelAccountId_externalId: { channelAccountId, externalId: msg.externalId } },
    create: {
      channelAccountId,
      externalId: msg.externalId,
      name: msg.contactName,
      isGroup: msg.isGroup,
      lastMessage: msg.body.slice(0, 500),
      lastMessageAt: msg.timestamp,
      unreadCount: 1,
      contactId: contactRecord.id,
    },
    update: {
      ...(conversationNameShouldUpdate ? { name: msg.contactName } : {}),
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
        channel: "TELEGRAM",
        messageId: createdMessage.id,
        accountId: channelAccountId,
        mediaId: msg.mediaId,
      })
      .catch((err) => {
        console.error("[telegram ingest] media-download enqueue failed:", err);
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
        title: msg.contactName,
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

  const activeBots = await prisma.wABot.findMany({
    where: { channelAccountId, isActive: true, status: "ACTIVE" },
    select: { id: true },
  });

  for (const bot of activeBots) {
    await botQueue.add("process-message", {
      botId: bot.id,
      conversationId: conversation.id,
      incomingMessage: msg.body,
      messageId: createdMessage.id,
      messageType: msg.type,
      mediaId: msg.mediaId ?? null,
      mimeType: msg.mimeType ?? null,
      caption: msg.caption ?? null,
      filename: msg.filename ?? null,
    });
  }

  return { messageId: createdMessage.id, conversationId: conversation.id };
}
