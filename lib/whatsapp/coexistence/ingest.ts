import { Prisma, type WAMessageOrigin } from "@prisma/client";
import { afterContactCreated } from "@/lib/billing/contact-limits";
import { prisma } from "@/lib/prisma";
import { markReplied } from "@/lib/chats/waiting";
import { mediaDownloadQueue } from "@/lib/queue";
import { addressBookNameFor, forgetAddressBookEntry, shouldApplyAddressBookName } from "@/lib/whatsapp/address-book";
import { contactsRemaining, notifyContactLimitOnce } from "@/lib/billing/contact-budget";
import { pauseConversationalRuns } from "@/lib/automations/dispatch";
import { BACKGROUND_EVENT_PRIORITY, emitDomainEvent } from "@/lib/events/emit";
import { jidCandidates, mapHistoryStatus, type NormalizedBusinessMessage, type NormalizedStateSyncContact } from "./normalize";

// Ingesta de lo que viene de la app WhatsApp Business del cliente (coexistencia).
// A diferencia de ingestInboundMessage() es SILENCIOSA: no notifica, no dispara
// bot ni automatizaciones, no auto-asigna y no incrementa mensajes sin leer.
// Solo deja el historial/los ecos visibles en el inbox. Única excepción: el
// evento de dominio contact.created (webhooks salientes) de cada contacto que
// nace aquí — ver emitContactCreated. contact.created no dispara
// automatizaciones (lib/automations/dispatch.ts), así que no sale ningún mensaje.

export interface BusinessIngestResult {
  created: number;
  updated: number;
  skipped: number;
  /** Chats del historial creados sin contacto por el tope del plan. */
  chatsWithoutContact: number;
}

type ChatEntry = { chatId: string; contactId: string | null; lastMessageAt: Date | null; created: boolean };
type ChatCache = Map<string, ChatEntry>;

// Contactos nuevos que todavía caben en el plan durante una importación.
interface ContactBudget {
  remaining: number;
}

// Una importación del historial puede crear cientos de contactos de golpe.
// Decisión: un contact.created POR contacto (el receptor necesita cada uno y
// el total ya está acotado por el tope de contactos del plan), pero con
// prioridad baja en la cola de eventos — los eventos en vivo pasan primero —
// y espaciados HISTORY_EVENT_SPACING_MS entre sí dentro de cada lote. Luego
// cada entrega lleva sus reintentos con backoff normales.
export const HISTORY_EVENT_SPACING_MS = 200;

async function emitContactCreated(accountId: string, chatId: string, contactId: string, source: "whatsapp_history" | "whatsapp_echo", index: number) {
  const refs = { account: { kind: "whatsapp" as const, id: accountId }, chat: { kind: "whatsapp" as const, id: chatId }, contactId };
  if (source === "whatsapp_history") {
    await emitDomainEvent({ type: "contact.created", ...refs, data: { origin: "ORGANIC", source: "history" } }, new Date(), {
      priority: BACKGROUND_EVENT_PRIORITY,
      delayMs: index * HISTORY_EVENT_SPACING_MS,
    });
  } else {
    await emitDomainEvent({ type: "contact.created", ...refs, data: { origin: "ORGANIC", source: "echo" } });
  }
}

// Encuentra (o crea) Contact + WAChat del cliente final. Para números de México
// prueba las dos formas (52… y 521…) antes de crear, para no duplicar chats.
// Sin cupo de contactos (historial al tope del plan) el chat se crea igual,
// sin contacto: la conversación no se pierde y el contacto nace cuando la
// persona vuelva a escribir (los entrantes no tienen tope).
async function resolveChat(accountId: string, userPhone: string, cache: ChatCache, source: "whatsapp_history" | "whatsapp_echo", budget: ContactBudget, emitted: { count: number }) {
  const cached = cache.get(userPhone);
  if (cached) return cached;

  const candidates = jidCandidates(userPhone);
  const chat = await prisma.wAChat.findFirst({
    where: { accountId, remoteJid: { in: candidates } },
    select: { id: true, contactId: true, lastMessageAt: true, remoteJid: true },
  });

  let entry: ChatEntry;
  if (chat?.contactId) {
    entry = { chatId: chat.id, contactId: chat.contactId, lastMessageAt: chat.lastMessageAt, created: false };
  } else {
    const jid = chat?.remoteJid ?? candidates[0];
    const bookName = await addressBookNameFor(accountId, jid);
    const existingContact = await prisma.contact.findUnique({ where: { accountId_remoteJid: { accountId, remoteJid: jid } }, select: { id: true } });
    let contactId: string | null = existingContact?.id ?? null;
    let contactCreated = false;
    if (!contactId && budget.remaining > 0) {
      budget.remaining--;
      const contact = await prisma.contact.upsert({
        where: { accountId_remoteJid: { accountId, remoteJid: jid } },
        create: { accountId, remoteJid: jid, name: bookName ?? jid, nameSource: bookName ? "address_book" : null, source },
        update: {},
        select: { id: true },
      });
      contactId = contact.id;
      contactCreated = true;
      await afterContactCreated({ waAccountId: accountId }, contact.id);
      if (bookName) await forgetAddressBookEntry(accountId, jid);
    }
    const created = chat
      ? contactId
        ? await prisma.wAChat.update({ where: { id: chat.id }, data: { contactId }, select: { id: true, lastMessageAt: true } })
        : { id: chat.id, lastMessageAt: chat.lastMessageAt }
      : await prisma.wAChat.create({
          data: { accountId, remoteJid: jid, name: bookName ?? jid, isGroup: false, contactId, unreadCount: 0 },
          select: { id: true, lastMessageAt: true },
        });
    entry = { chatId: created.id, contactId, lastMessageAt: created.lastMessageAt, created: !chat };
    if (contactCreated && contactId) await emitContactCreated(accountId, created.id, contactId, source, emitted.count++);
  }
  cache.set(userPhone, entry);
  return entry;
}

export async function ingestBusinessAppMessages(
  accountId: string,
  messages: NormalizedBusinessMessage[],
  origin: Extract<WAMessageOrigin, "BUSINESS_APP_ECHO" | "HISTORY">
): Promise<BusinessIngestResult> {
  const result: BusinessIngestResult = { created: 0, updated: 0, skipped: 0, chatsWithoutContact: 0 };
  const cache: ChatCache = new Map();
  // El historial respeta el tope de contactos del plan; un eco es una
  // conversación en vivo (como un entrante) y siempre crea su contacto.
  const budget: ContactBudget = { remaining: origin === "HISTORY" ? await contactsRemaining(accountId) : Infinity };
  const source = origin === "HISTORY" ? "whatsapp_history" : "whatsapp_echo";
  const emitted = { count: 0 };

  // Agrupa por conversación para guardar por lotes: un historial grande
  // (decenas de miles de mensajes) no puede costar varias consultas por mensaje.
  const byChat = new Map<string, NormalizedBusinessMessage[]>();
  for (const msg of messages) {
    const chat = await resolveChat(accountId, msg.userPhone, cache, source, budget, emitted);
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
      // El payload lleva props opcionales (style/buttonLabel), que Prisma no
      // admite en un JSON de entrada; mismo casteo que usa el resto del repo
      // en el límite de Prisma (automations/publish.ts, webhooks/fanout.ts).
      ...(m.interactivePayload
        ? { interactivePayload: m.interactivePayload as unknown as Prisma.InputJsonValue }
        : {}),
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

  if (origin === "HISTORY") {
    const contactless = Array.from(cache.values()).filter((c) => c.created && !c.contactId);
    if (contactless.length > 0) {
      result.chatsWithoutContact = contactless.length;
      const ids = new Set(contactless.map((c) => c.chatId));
      const messages = Array.from(byChat.entries()).filter(([id]) => ids.has(id)).reduce((n, [, list]) => n + list.length, 0);
      const updated = await prisma.wAAccount.update({
        where: { id: accountId },
        data: { historySkippedChats: { increment: contactless.length }, historySkippedMessages: { increment: messages } },
        select: { historySkippedChats: true },
      });
      await notifyContactLimitOnce(accountId, contactless.length, updated.historySkippedChats);
    }
  }

  if (origin === "BUSINESS_APP_ECHO") {
    // El dueño atendió desde el teléfono: las automatizaciones conversacionales
    // de ese chat se pausan igual que con una respuesta manual desde Colibly.
    // Además, el cliente ya no espera respuesta (lib/chats/waiting.ts).
    for (const chat of cache.values()) {
      if (!touched.has(chat.chatId)) continue;
      await pauseConversationalRuns({ kind: "whatsapp", id: chat.chatId });
      await markReplied("whatsapp", chat.chatId);
    }
  }
  return result;
}

async function enqueueMediaDownload(messageId: string, accountId: string, mediaId: string): Promise<void> {
  await mediaDownloadQueue
    .add("download-media", { messageId, accountId, mediaId })
    .catch((err) => console.error("[coexistence] media-download enqueue failed:", err));
}

// Libreta del teléfono (smb_app_state_sync). NO crea contactos: solo pone el
// nombre de la libreta a un contacto que ya existe (mismo número, misma cuenta
// de la organización) y guarda el resto en wa_address_book para usarlo cuando
// esa persona escriba o aparezca en el historial. Las bajas solo borran la
// entrada de la libreta, nunca un contacto del CRM (puede tener notas, citas…).
export async function applyStateSyncContacts(
  accountId: string,
  contacts: NormalizedStateSyncContact[]
): Promise<{ named: number; cached: number; removed: number }> {
  let named = 0;
  let cached = 0;
  let removed = 0;
  for (const c of contacts) {
    const candidates = jidCandidates(c.phone);
    if (candidates.length === 0) continue;
    if (c.action === "remove") {
      const del = await prisma.wAAddressBookEntry.deleteMany({ where: { accountId, phone: { in: candidates } } });
      removed += del.count;
      continue;
    }
    const name = (c.fullName ?? c.firstName)?.slice(0, 200) ?? null;
    if (!name) continue;
    const existing = await prisma.contact.findFirst({
      where: { accountId, remoteJid: { in: candidates } },
      select: { id: true, name: true, nameSource: true, remoteJid: true },
    });
    if (existing) {
      if (shouldApplyAddressBookName(name, existing)) {
        await prisma.contact.update({ where: { id: existing.id }, data: { name, nameSource: "address_book" } });
        // El inbox muestra WAChat.name: se alinea si seguía con el número o el nombre anterior.
        await prisma.wAChat.updateMany({
          where: { accountId, contactId: existing.id, OR: [{ name: null }, { name: existing.remoteJid }, ...(existing.name ? [{ name: existing.name }] : [])] },
          data: { name },
        });
        named++;
      }
    } else {
      await prisma.wAAddressBookEntry.upsert({
        where: { accountId_phone: { accountId, phone: candidates[0] } },
        create: { accountId, phone: candidates[0], name },
        update: { name },
      });
      cached++;
    }
  }
  return { named, cached, removed };
}
