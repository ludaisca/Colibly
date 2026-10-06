import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { botQueue, mediaDownloadQueue } from "@/lib/queue";
import { autoAssignChat } from "@/lib/whatsapp/auto-assign";
import { shouldUpdateName } from "@/lib/whatsapp/contact-name";
import { resolveContact } from "@/lib/contacts/resolve";
import { BOT_REPLY_DEBOUNCE_MS } from "@/lib/bots/guards";
import { emitDomainEvent } from "@/lib/events/emit";
import { dispatchInboundMessage } from "@/lib/automations/dispatch";

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
  replyToWamid?: string | null;
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

  // Un solo punto de alta (lib/contacts/resolve.ts): reconoce el mismo móvil
  // aunque llegue como 52… o 521…, y devuelve el identificador con el que ya
  // existe para usarlo también en el chat.
  const resolved = await resolveContact(
    { kind: "whatsapp", accountId },
    {
      remoteJid: msg.remoteJid,
      name: msg.contactName,
      // First-touch attribution: solo se escribe al crear el Contact (nunca en
      // un update): un segundo mensaje, con o sin referral propio, no debe
      // pisar el origen real del primer contacto. Mismo principio que realName.
      attribution: msg.referral?.ctwa_clid
        ? { leadOrigin: "CTWA", ctwaClid: msg.referral.ctwa_clid, adId: msg.referral.source_id ?? null }
        : undefined,
    }
  );
  const contactRecord = resolved.contact;
  const remoteJid = resolved.remoteJid;

  const existingChat = await prisma.wAChat.findUnique({
    where: { accountId_remoteJid: { accountId, remoteJid } },
    select: { name: true },
  });
  const chatNameShouldUpdate = shouldUpdateName(msg.contactName, existingChat?.name, remoteJid);

  const chat = await prisma.wAChat.upsert({
    where: { accountId_remoteJid: { accountId, remoteJid } },
    create: {
      accountId,
      remoteJid,
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

  // Un cliente que vuelve a escribir en un chat RESUELTO lo reabre — antes
  // quedaba RESOLVED y fuera de la calificación programada, la recuperación de
  // leads (ambas filtran OPEN/PENDING) y las métricas de resolución. PENDING no
  // se toca: puede significar otra cosa para el equipo.
  if (chat.status === "RESOLVED") {
    await prisma.wAChat.update({ where: { id: chat.id }, data: { status: "OPEN", resolvedAt: null } });
  }

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
        replyToWamid: msg.replyToWamid ?? null,
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
  const autoAssigned = !assignedToId;
  if (!assignedToId) {
    assignedToId = await autoAssignChat(accountId, chat.id);
  }

  // Eventos de dominio (webhooks salientes). emitDomainEvent solo encola y
  // nunca lanza, así que no puede tumbar la ingesta.
  const refs = {
    account: { kind: "whatsapp" as const, id: accountId },
    chat: { kind: "whatsapp" as const, id: chat.id },
    contactId: contactRecord.id,
  };
  if (resolved.created) {
    await emitDomainEvent({ type: "contact.created", ...refs, data: { origin: contactRecord.leadOrigin, source: "inbound" } }, msg.timestamp);
    if (contactRecord.leadOrigin === "CTWA") {
      await emitDomainEvent({ type: "lead.ad_captured", ...refs, data: { origin: "CTWA", adId: contactRecord.adId } }, msg.timestamp);
    }
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

  // Un solo bot responde por cuenta (la API ya no permite activar un segundo;
  // el orderBy cubre cuentas que quedaron con varios activos de antes). El
  // retraso agrupa ráfagas: si llega otro mensaje en esos segundos, este job
  // se descarta y responde el del mensaje más reciente (ver lib/bots/guards.ts).
  // Automatizaciones antes que el bot: una que esté esperando respuesta en
  // este chat, o que arranque con este mensaje, lo toma y el bot calla. Un
  // fallo del motor nunca debe dejar al lead sin respuesta del bot.
  const { suppressBot } = await dispatchInboundMessage({
    account: refs.account,
    chat: refs.chat,
    contactId: contactRecord.id,
    text: msg.body,
    replyId: msg.interactiveReplyId ?? null,
    isFirstMessage: !existingChat,
  }).catch((err) => {
    console.error("[ingest] dispatchInboundMessage falló:", err);
    return { suppressBot: false };
  });

  const activeBot = suppressBot
    ? null
    : await prisma.wABot.findFirst({
        where: { waAccountId: accountId, isActive: true, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });

  if (activeBot) {
    await botQueue.add("process-message", {
      botId: activeBot.id,
      waChatId: chat.id,
      incomingMessage: msg.body,
      messageId: createdMessage.id,
      messageType: msg.type,
      mediaId: msg.mediaId ?? null,
      localMediaPath: msg.localMediaPath ?? null,
      mimeType: msg.mimeType ?? null,
      caption: msg.caption ?? null,
      filename: msg.filename ?? null,
    }, { delay: BOT_REPLY_DEBOUNCE_MS });
  }

  return { messageId: createdMessage.id, chatId: chat.id };
}
