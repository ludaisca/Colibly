import type { ChannelAccount } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ingestChannelMessage } from "@/lib/telegram/ingest-message";
import { afterContactCreated } from "@/lib/billing/contact-limits";
import { accountDefaultTeamId } from "@/lib/teams/teams";
import { markReplied } from "@/lib/chats/waiting";
import { emitMessageSent } from "@/lib/events/message-sent";
import { queuePush } from "@/lib/notifications/push";
import { mediaDownloadQueue } from "@/lib/queue";
import { phoneOfJid, type GowaEvent, type NormalizedGowaMessage } from "./webhook";

// Persistencia de los eventos de GoWA de UNA cuenta ya autenticada (firma
// válida, device correcto, canal habilitado). La ruta del webhook solo
// autentica y llama a handleGowaEvent().

export async function handleGowaEvent(account: ChannelAccount, event: GowaEvent): Promise<void> {
  switch (event.kind) {
    case "message":
      if (event.message.fromMe) await persistPhoneEcho(account, event.message);
      else await ingestInbound(account, event.message);
      return;
    case "ack":
      await applyAck(account.id, event.ids, event.status);
      return;
    case "reaction":
      await applyReaction(account.id, event.externalId, event.targetId, event.emoji);
      return;
    case "revoked":
      // El cliente borró el mensaje "para todos": se conserva en la bandeja (es
      // historial del negocio) con una marca en el cuerpo, igual que hace
      // WhatsApp Business al mostrar "Se eliminó este mensaje".
      await prisma.channelMessage.updateMany({
        where: { externalMessageId: event.targetId, direction: "INBOUND", conversation: { channelAccountId: account.id, externalId: event.externalId } },
        data: { caption: "El contacto eliminó este mensaje" },
      });
      return;
    case "logged_out":
      await markAccountProblem(account, "ERROR", `Se cerró la sesión de WhatsApp (${event.reason}). Vuelve a escanear el código QR.`, "WhatsApp se desconectó");
      return;
    case "temporary_ban": {
      const until = event.until ? ` hasta el ${event.until.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" })}` : "";
      await markAccountProblem(account, "ERROR", `WhatsApp suspendió el número${until}: ${event.reason}.`, "WhatsApp suspendió el número");
      return;
    }
    case "reachout_timelock":
      if (event.active) {
        // Sigue recibiendo y contestando chats existentes: solo no puede abrir
        // conversaciones nuevas. La cuenta queda CONNECTED con el aviso.
        await markAccountProblem(account, "CONNECTED", "WhatsApp limitó este número: por ahora no puede escribir a personas con las que no tiene conversación.", "WhatsApp limitó el número");
      } else if (account.status === "CONNECTED" && account.errorMessage) {
        await prisma.channelAccount.update({ where: { id: account.id }, data: { errorMessage: null } });
      }
      return;
    case "ignored":
      return;
  }
}

async function ingestInbound(account: ChannelAccount, msg: NormalizedGowaMessage): Promise<void> {
  await ingestChannelMessage(account.id, "WHATSAPP_WEB", {
    externalId: msg.externalId,
    externalMessageId: msg.externalMessageId,
    timestamp: msg.timestamp,
    type: msg.type,
    body: msg.body,
    contactName: msg.contactName,
    isGroup: false,
    // El id del mensaje basta para descargarlo después (GET /message/:id/download).
    mediaId: msg.hasMedia ? msg.externalMessageId : null,
    mimeType: msg.mimeType,
    filename: msg.filename,
    caption: msg.caption,
    replyToExternalId: msg.replyToExternalId,
    interactiveReplyId: msg.interactiveReplyId,
  });
}

/**
 * Mensaje escrito desde el teléfono vinculado (o desde WhatsApp Web en otro
 * lado): se guarda como saliente "business_app" — cuenta como respuesta humana
 * (pausa el bot, lib/bots/guards.ts) y quita la espera, sin notificar. Los
 * envíos hechos por la app ya están guardados con su id: el dedup los descarta.
 */
async function persistPhoneEcho(account: ChannelAccount, msg: NormalizedGowaMessage): Promise<void> {
  const existing = await prisma.channelMessage.findFirst({
    where: { externalMessageId: msg.externalMessageId, conversation: { channelAccountId: account.id } },
    select: { id: true },
  });
  if (existing) return;

  const phone = phoneOfJid(msg.externalId);
  const fallbackName = phone ? `+${phone}` : msg.externalId;
  const contactWhere = { channelAccountId_remoteJid: { channelAccountId: account.id, remoteJid: msg.externalId } };
  const knownContact = await prisma.contact.findUnique({ where: contactWhere, select: { id: true } });
  const contact = knownContact ?? (await prisma.contact.upsert({
    where: contactWhere,
    create: { channelAccountId: account.id, remoteJid: msg.externalId, name: fallbackName },
    update: {},
    select: { id: true },
  }));
  if (!knownContact) await afterContactCreated({ channelAccountId: account.id }, contact.id);

  const conversationExists = await prisma.conversation.findUnique({
    where: { channelAccountId_externalId: { channelAccountId: account.id, externalId: msg.externalId } },
    select: { id: true },
  });
  const conversation = await prisma.conversation.upsert({
    where: { channelAccountId_externalId: { channelAccountId: account.id, externalId: msg.externalId } },
    create: {
      channelAccountId: account.id,
      externalId: msg.externalId,
      name: fallbackName,
      isGroup: false,
      lastMessage: msg.body.slice(0, 500),
      lastMessageAt: msg.timestamp,
      contactId: contact.id,
      teamId: conversationExists ? undefined : await accountDefaultTeamId("channel", account.id),
    },
    update: { lastMessage: msg.body.slice(0, 500), lastMessageAt: msg.timestamp },
    select: { id: true },
  });

  let created;
  try {
    created = await prisma.channelMessage.create({
      data: {
        externalMessageId: msg.externalMessageId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        messageType: msg.type,
        body: msg.hasMedia ? null : msg.body,
        caption: msg.caption,
        mediaId: msg.hasMedia ? msg.externalMessageId : null,
        mimeType: msg.mimeType,
        filename: msg.filename,
        status: "sent",
        sentVia: "business_app",
        replyToExternalId: msg.replyToExternalId,
        timestamp: msg.timestamp,
      },
      select: { id: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
  await markReplied("channel", conversation.id);
  if (msg.hasMedia) {
    await mediaDownloadQueue
      .add("download-media", { channel: "WHATSAPP_WEB", messageId: created.id, accountId: account.id, mediaId: msg.externalMessageId })
      .catch((err) => console.error("[gowa ingest] media-download enqueue failed:", err));
  }
  await emitMessageSent("channel", created.id, "business_app");
}

const ACK_RANK: Record<string, number> = { failed: 0, sent: 1, delivered: 2, read: 3 };

async function applyAck(accountId: string, ids: string[], status: "delivered" | "read"): Promise<void> {
  // Nunca bajar de "leído" a "entregado" si los acuses llegan en desorden.
  const lower = Object.keys(ACK_RANK).filter((s) => ACK_RANK[s] < ACK_RANK[status]);
  await prisma.channelMessage.updateMany({
    where: {
      externalMessageId: { in: ids.slice(0, 100) },
      direction: "OUTBOUND",
      conversation: { channelAccountId: accountId },
      OR: [{ status: null }, { status: { in: lower } }],
    },
    data: { status },
  });
}

async function applyReaction(accountId: string, externalId: string, targetId: string, emoji: string | null): Promise<void> {
  await prisma.channelMessage.updateMany({
    where: { externalMessageId: targetId, conversation: { channelAccountId: accountId, externalId } },
    data: { reactionEmoji: emoji },
  });
}

async function markAccountProblem(
  account: ChannelAccount,
  status: "ERROR" | "CONNECTED",
  message: string,
  title: string
): Promise<void> {
  // Idempotente: GoWA reintenta y el mismo aviso no debe repetirse.
  if (account.status === status && account.errorMessage === message) return;
  await prisma.channelAccount.update({ where: { id: account.id }, data: { status, errorMessage: message } });
  const recipients = new Set<string>();
  if (account.ownerId) recipients.add(account.ownerId);
  const admins = await prisma.user.findMany({
    where: { organizationId: account.organizationId, role: "admin", disabledAt: null },
    select: { id: true },
  });
  for (const a of admins) recipients.add(a.id);
  const link = "/whatsapp-web/cuentas";
  for (const userId of recipients) {
    await prisma.notification.create({
      data: { userId, type: "ACCOUNT_STATUS", title: `${title}: ${account.name}`, body: message.slice(0, 300), link },
    });
    await queuePush(userId, { title: `${title}: ${account.name}`, body: message, link, tag: `account:${account.id}` });
  }
}
