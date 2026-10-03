import { Prisma, type WAMessageOrigin } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mediaDownloadQueue } from "@/lib/queue";
import { shouldUpdateName } from "@/lib/whatsapp/contact-name";
import { pauseConversationalRuns } from "@/lib/automations/dispatch";
import { jidCandidates, mapHistoryStatus, type NormalizedBusinessMessage, type NormalizedStateSyncContact } from "./normalize";

// Ingesta de lo que viene de la app WhatsApp Business del cliente (coexistencia).
// A diferencia de ingestInboundMessage() es SILENCIOSA: no notifica, no dispara
// bot, automatizaciones ni eventos de dominio, no auto-asigna y no incrementa
// mensajes sin leer. Solo deja el historial/los ecos visibles en el inbox.

export interface BusinessIngestResult {
  created: number;
  updated: number;
  skipped: number;
}

type ChatCache = Map<string, { chatId: string; contactId: string; lastMessageAt: Date | null; created: boolean }>;

// Encuentra (o crea) Contact + WAChat del cliente final. Para números de México
// prueba las dos formas (52… y 521…) antes de crear, para no duplicar chats.
async function resolveChat(accountId: string, userPhone: string, cache: ChatCache) {
  const cached = cache.get(userPhone);
  if (cached) return cached;

  const candidates = jidCandidates(userPhone);
  const chat = await prisma.wAChat.findFirst({
    where: { accountId, remoteJid: { in: candidates } },
    select: { id: true, contactId: true, lastMessageAt: true, remoteJid: true },
  });

  let entry: { chatId: string; contactId: string; lastMessageAt: Date | null; created: boolean };
  if (chat?.contactId) {
    entry = { chatId: chat.id, contactId: chat.contactId, lastMessageAt: chat.lastMessageAt, created: false };
  } else {
    const jid = chat?.remoteJid ?? candidates[0];
    const contact = await prisma.contact.upsert({
      where: { accountId_remoteJid: { accountId, remoteJid: jid } },
      create: { accountId, remoteJid: jid, name: jid },
      update: {},
      select: { id: true },
    });
    const created = chat
      ? await prisma.wAChat.update({ where: { id: chat.id }, data: { contactId: contact.id }, select: { id: true, lastMessageAt: true } })
      : await prisma.wAChat.create({
          data: { accountId, remoteJid: jid, name: jid, isGroup: false, contactId: contact.id, unreadCount: 0 },
          select: { id: true, lastMessageAt: true },
        });
    entry = { chatId: created.id, contactId: contact.id, lastMessageAt: created.lastMessageAt, created: !chat };
  }
  cache.set(userPhone, entry);
  return entry;
}

export async function ingestBusinessAppMessages(
  accountId: string,
  messages: NormalizedBusinessMessage[],
  origin: Extract<WAMessageOrigin, "BUSINESS_APP_ECHO" | "HISTORY">
): Promise<BusinessIngestResult> {
  const result: BusinessIngestResult = { created: 0, updated: 0, skipped: 0 };
  const cache: ChatCache = new Map();
  const touched = new Map<string, { lastMessage: string; lastMessageAt: Date }>();

  for (const msg of messages) {
    const chat = await resolveChat(accountId, msg.userPhone, cache);

    const existing = await prisma.wAMessage.findFirst({
      where: { chatId: chat.chatId, wamid: msg.wamid },
      select: { id: true, messageType: true },
    });
    if (existing) {
      // El historial manda los medios en un webhook aparte: el mensaje ya existe
      // como `media_placeholder` y ahora llega con su contenido.
      if (existing.messageType === "media_placeholder" && msg.type !== "media_placeholder") {
        await prisma.wAMessage.update({
          where: { id: existing.id },
          data: { messageType: msg.type, body: msg.body, caption: msg.caption, mediaId: msg.mediaId, mimeType: msg.mimeType, filename: msg.filename },
        });
        if (msg.mediaId) await enqueueMediaDownload(existing.id, accountId, msg.mediaId);
        result.updated++;
      } else {
        result.skipped++;
      }
      continue;
    }

    try {
      const created = await prisma.wAMessage.create({
        data: {
          wamid: msg.wamid,
          chatId: chat.chatId,
          direction: msg.direction,
          origin,
          messageType: msg.type,
          body: msg.body,
          caption: msg.caption,
          mediaId: msg.mediaId,
          mimeType: msg.mimeType,
          filename: msg.filename,
          status: mapHistoryStatus(msg.historyStatus),
          timestamp: msg.timestamp,
        },
        select: { id: true },
      });
      result.created++;
      if (msg.mediaId && msg.type !== "text") await enqueueMediaDownload(created.id, accountId, msg.mediaId);

      const prev = touched.get(chat.chatId);
      const newest = Math.max(chat.lastMessageAt?.getTime() ?? 0, prev?.lastMessageAt.getTime() ?? 0);
      if (msg.timestamp.getTime() > newest) touched.set(chat.chatId, { lastMessage: msg.body.slice(0, 500), lastMessageAt: msg.timestamp });
    } catch (err) {
      // Carrera con una entrega duplicada: @@unique([chatId, wamid]).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") result.skipped++;
      else throw err;
    }
  }

  // Última actividad del chat solo si lo importado es más reciente que lo que
  // ya había (el historial es antiguo; un eco es la actividad más nueva).
  for (const [chatId, last] of touched) {
    await prisma.wAChat.update({ where: { id: chatId }, data: { lastMessage: last.lastMessage, lastMessageAt: last.lastMessageAt } });
  }

  if (origin === "BUSINESS_APP_ECHO") {
    // El dueño atendió desde el teléfono: las automatizaciones conversacionales
    // de ese chat se pausan igual que con una respuesta manual desde Colibly.
    for (const chat of cache.values()) {
      if (touched.has(chat.chatId)) await pauseConversationalRuns({ kind: "whatsapp", id: chat.chatId });
    }
  }
  return result;
}

async function enqueueMediaDownload(messageId: string, accountId: string, mediaId: string): Promise<void> {
  await mediaDownloadQueue
    .add("download-media", { messageId, accountId, mediaId })
    .catch((err) => console.error("[coexistence] media-download enqueue failed:", err));
}

// Contactos de la libreta del teléfono (smb_app_state_sync). Solo crea o
// completa nombres: las bajas NO borran nada del CRM (el contacto puede tener
// notas, etiquetas y citas en Colibly).
export async function applyStateSyncContacts(accountId: string, contacts: NormalizedStateSyncContact[]): Promise<{ upserted: number; ignoredRemovals: number }> {
  let upserted = 0;
  let ignoredRemovals = 0;
  for (const c of contacts) {
    if (c.action === "remove") {
      ignoredRemovals++;
      continue;
    }
    const candidates = jidCandidates(c.phone);
    const existing = await prisma.contact.findFirst({
      where: { accountId, remoteJid: { in: candidates } },
      select: { id: true, name: true, remoteJid: true },
    });
    const name = c.fullName ?? c.firstName;
    if (existing) {
      if (name && shouldUpdateName(name, existing.name, existing.remoteJid)) {
        await prisma.contact.update({ where: { id: existing.id }, data: { name } });
        upserted++;
      }
    } else {
      await prisma.contact.create({ data: { accountId, remoteJid: candidates[0], name: name ?? candidates[0] } });
      upserted++;
    }
  }
  return { upserted, ignoredRemovals };
}
