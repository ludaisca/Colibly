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

  // Agrupa por conversación para guardar por lotes: un historial grande
  // (decenas de miles de mensajes) no puede costar varias consultas por mensaje.
  const byChat = new Map<string, NormalizedBusinessMessage[]>();
  for (const msg of messages) {
    const chat = await resolveChat(accountId, msg.userPhone, cache);
    const list = byChat.get(chat.chatId);
    if (list) list.push(msg);
    else byChat.set(chat.chatId, [msg]);
  }
  const lastAtByChat = new Map(Array.from(cache.values()).map((c) => [c.chatId, c.lastMessageAt] as const));

  const touched = new Map<string, { lastMessage: string; lastMessageAt: Date }>();

  for (const [chatId, list] of byChat) {
    const existing = await prisma.wAMessage.findMany({
      where: { chatId, wamid: { in: list.map((m) => m.wamid) } },
      select: { id: true, wamid: true, messageType: true },
    });
    const existingByWamid = new Map(existing.map((e) => [e.wamid as string, e]));

    const fresh: NormalizedBusinessMessage[] = [];
    const seen = new Set<string>();
    for (const msg of list) {
      const prev = existingByWamid.get(msg.wamid);
      if (prev) {
        // El historial manda los medios en un webhook aparte: el mensaje ya existe
        // como `media_placeholder` y ahora llega con su contenido.
        if (prev.messageType === "media_placeholder" && msg.type !== "media_placeholder") {
          await prisma.wAMessage.update({
            where: { id: prev.id },
            data: { messageType: msg.type, body: msg.body, caption: msg.caption, mediaId: msg.mediaId, mimeType: msg.mimeType, filename: msg.filename },
          });
          if (msg.mediaId) await enqueueMediaDownload(prev.id, accountId, msg.mediaId);
          result.updated++;
        } else {
          result.skipped++;
        }
        continue;
      }
      // Duplicado dentro del mismo lote.
      if (seen.has(msg.wamid)) {
        result.skipped++;
        continue;
      }
      seen.add(msg.wamid);
      fresh.push(msg);
    }

    const row = (m: NormalizedBusinessMessage) => ({
      wamid: m.wamid,
      chatId,
      direction: m.direction,
      origin,
      messageType: m.type,
      body: m.body,
      caption: m.caption,
      mediaId: m.mediaId,
      mimeType: m.mimeType,
      filename: m.filename,
      status: mapHistoryStatus(m.historyStatus),
      timestamp: m.timestamp,
    });
    const needsDownload = (m: NormalizedBusinessMessage) => !!m.mediaId && m.type !== "text";

    // Sin medio: un solo INSERT por lote. Con medio: uno a uno, porque hace falta
    // el id del mensaje para encolar la descarga.
    const plain = fresh.filter((m) => !needsDownload(m));
    if (plain.length > 0) {
      const inserted = await prisma.wAMessage.createMany({ data: plain.map(row), skipDuplicates: true });
      result.created += inserted.count;
      // skipDuplicates cubre la carrera con una entrega duplicada del webhook.
      result.skipped += plain.length - inserted.count;
    }
    for (const msg of fresh.filter(needsDownload)) {
      try {
        const created = await prisma.wAMessage.create({ data: row(msg), select: { id: true } });
        result.created++;
        await enqueueMediaDownload(created.id, accountId, msg.mediaId as string);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") result.skipped++;
        else throw err;
      }
    }

    // Última actividad del chat solo si lo importado es más reciente que lo que
    // ya había (el historial es antiguo; un eco es la actividad más nueva).
    let newest = lastAtByChat.get(chatId)?.getTime() ?? 0;
    for (const msg of fresh) {
      if (msg.timestamp.getTime() > newest) {
        newest = msg.timestamp.getTime();
        touched.set(chatId, { lastMessage: msg.body.slice(0, 500), lastMessageAt: msg.timestamp });
      }
    }
  }

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
