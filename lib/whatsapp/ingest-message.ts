import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { botQueue, mediaDownloadQueue } from "@/lib/queue";
import { autoAssignChat } from "@/lib/whatsapp/auto-assign";
import { shouldUpdateName } from "@/lib/whatsapp/contact-name";

// Objeto `referral` que Meta agrega a msg cuando el chat se originó en un
// anuncio click-to-WhatsApp. ctwa_clid es el único campo que se reenvía a la
// Conversions API (lib/meta/conversions.ts); el resto se guarda para
// auditoría/debug en WAMessage.referral.
export interface InboundReferral {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  media_type?: string;
  image_url?: string;
  video_url?: string;
  thumbnail_url?: string;
  ctwa_clid?: string;
}

export interface NormalizedInboundMessage {
  remoteJid: string;
  wamid: string | null;
  timestamp: Date;
  type: string;
  body: string;
  contactName: string;
  isGroup: boolean;
  // Meta Cloud media id (resolved later to a downloadable URL).
  mediaId?: string | null;
  // If the caller already produced local bytes, the relative path under
  // MEDIA_ROOT is passed here so we skip the async download queue.
  localMediaPath?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  caption?: string | null;
  bytesSize?: number | null;
  // id de botón/fila elegido en una respuesta a un mensaje interactivo
  // (interactive.button_reply.id / list_reply.id) — el título ya viaja en
  // `body`, esto es solo para correlacionar qué opción se tocó.
  interactiveReplyId?: string | null;
  // Presente solo en el primer mensaje de un chat que vino de un anuncio
  // click-to-WhatsApp. Meta lo manda en cada mensaje de ese chat, pero solo
  // importa para atribución en el create del Contact (first-touch) — ver
  // más abajo.
  referral?: InboundReferral | null;
}

export interface IngestResult {
  messageId: string;
  chatId: string;
}

// Single entry point for inbound messages (hoy solo el webhook de Meta Cloud)
// — concentra CRM (Contact upsert), chat threading, notificaciones y disparo
// de bots para que cualquier canal futuro se comporte idéntico.
export async function ingestInboundMessage(
  accountId: string,
  msg: NormalizedInboundMessage
): Promise<IngestResult | null> {
  if (msg.wamid) {
    const existing = await prisma.wAMessage.findFirst({
      where: { wamid: msg.wamid },
      select: { id: true },
    });
    if (existing) return null;
  }

  const [existingContact, existingChat] = await Promise.all([
    prisma.contact.findUnique({
      where: { accountId_remoteJid: { accountId, remoteJid: msg.remoteJid } },
      select: { name: true },
    }),
    prisma.wAChat.findUnique({
      where: { accountId_remoteJid: { accountId, remoteJid: msg.remoteJid } },
      select: { name: true },
    }),
  ]);

  const contactNameShouldUpdate = shouldUpdateName(msg.contactName, existingContact?.name, msg.remoteJid);
  const chatNameShouldUpdate = shouldUpdateName(msg.contactName, existingChat?.name, msg.remoteJid);

  const contactRecord = await prisma.contact.upsert({
    where: { accountId_remoteJid: { accountId, remoteJid: msg.remoteJid } },
    create: {
      accountId,
      remoteJid: msg.remoteJid,
      name: msg.contactName,
      // First-touch attribution: solo se setea al crear el Contact, nunca en
      // el `update` de abajo — un segundo mensaje (con o sin referral propio)
      // no debe pisar el origen real del primer contacto. Mismo principio que
      // realName en este mismo modelo.
      ...(msg.referral?.ctwa_clid
        ? {
            leadOrigin: "CTWA" as const,
            ctwaClid: msg.referral.ctwa_clid,
            adId: msg.referral.source_id ?? null,
          }
        : {}),
    },
    update: contactNameShouldUpdate ? { name: msg.contactName } : {},
  });

  const chat = await prisma.wAChat.upsert({
    where: { accountId_remoteJid: { accountId, remoteJid: msg.remoteJid } },
    create: {
      accountId,
      remoteJid: msg.remoteJid,
      name: msg.contactName,
      isGroup: msg.isGroup,
      lastMessage: msg.body.slice(0, 500),
      lastMessageAt: msg.timestamp,
      unreadCount: 1,
      contactId: contactRecord.id,
    },
    update: {
      ...(chatNameShouldUpdate ? { name: msg.contactName } : {}),
      isGroup: msg.isGroup,
      lastMessage: msg.body.slice(0, 500),
      lastMessageAt: msg.timestamp,
      unreadCount: { increment: 1 },
      contactId: contactRecord.id,
    },
  });

  let createdMessage;
  try {
    createdMessage = await prisma.wAMessage.create({
      data: {
        wamid: msg.wamid,
        chatId: chat.id,
        direction: "INBOUND",
        messageType: msg.type,
        body: msg.body,
        caption: msg.caption ?? null,
        mediaId: msg.mediaId ?? null,
        mediaUrl: msg.localMediaPath ?? null,
        mimeType: msg.mimeType ?? null,
        filename: msg.filename ?? null,
        bytesSize: msg.bytesSize ?? null,
        interactivePayload: msg.interactiveReplyId ? { replyId: msg.interactiveReplyId } : undefined,
        referral: msg.referral ? (msg.referral as Prisma.InputJsonValue) : undefined,
        timestamp: msg.timestamp,
      },
    });
  } catch (err) {
    // Carrera entre entregas duplicadas del webhook: el findFirst de arriba no
    // vio el duplicado pero el @@unique([chatId, wamid]) sí — tratarlo como el
    // dedupe normal en lugar de reventar con un 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return null;
    }
    throw err;
  }

  // Media entrante de Meta llega solo como mediaId — los bytes se descargan async.
  if (msg.mediaId && !msg.localMediaPath && msg.type !== "text") {
    await mediaDownloadQueue
      .add("download-media", {
        messageId: createdMessage.id,
        accountId,
        mediaId: msg.mediaId,
      })
      .catch((err) => {
        console.error("[ingest] media-download enqueue failed:", err);
      });
  }

  let assignedToId = chat.assignedToId;
  if (!assignedToId) {
    assignedToId = await autoAssignChat(accountId, chat.id);
  }

  if (assignedToId) {
    await prisma.notification.create({
      data: {
        userId: assignedToId,
        type: "CHAT_MESSAGE",
        title: msg.contactName,
        body: msg.body.slice(0, 200),
        link: `/whatsapp/chat/${accountId}/${chat.id}`,
      },
    });
  }

  await prisma.wAAccount.update({
    where: { id: accountId },
    data: { lastActivity: new Date() },
  });

  const activeBots = await prisma.wABot.findMany({
    where: { waAccountId: accountId, isActive: true, status: "ACTIVE" },
    select: { id: true },
  });

  for (const bot of activeBots) {
    await botQueue.add("process-message", {
      botId: bot.id,
      waChatId: chat.id,
      incomingMessage: msg.body,
      messageId: createdMessage.id,
      messageType: msg.type,
      mediaId: msg.mediaId ?? null,
      localMediaPath: msg.localMediaPath ?? null,
      mimeType: msg.mimeType ?? null,
      caption: msg.caption ?? null,
      filename: msg.filename ?? null,
    });
  }

  return { messageId: createdMessage.id, chatId: chat.id };
}