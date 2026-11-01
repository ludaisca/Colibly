import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isOrgWritable } from "@/lib/billing/gates";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForChat } from "@/lib/events/refs";
import { findOrCreateTag } from "@/lib/tags";
import { OutboundError, sendOutbound } from "@/lib/messaging/outbound";
import { AUTO_RESOLVE_BATCH, autoResolveCutoff } from "./auto-resolve-rules";

// Resolver solos los chats inactivos (Chatwoot: auto_resolve_after).
//
// Cada 15 min (cola `inbox`, job `tick`), por organización con la función
// activa y escribible: chats OPEN/PENDING sin mensajes desde hace N horas,
// sin posposición vigente y —si skipWaiting— sin cliente esperando. Cada
// chat se reclama con un updateMany condicionado al mismo lastMessageAt que
// se leyó: si entró un mensaje en medio, count = 0 y no se toca.
//
// Después de resolver: evento conversation.resolved, etiqueta opcional (solo
// WhatsApp: los canales genéricos no tienen etiquetas de chat) y mensaje
// opcional, que NO cuenta como respuesta (countsAsReply: false) y respeta la
// ventana de 24 h — si está cerrada simplemente no se manda. No se envía CSAT:
// nadie atendió el chat.

export interface AutoResolveResult {
  organizations: number;
  resolved: number;
  messagesSent: number;
  errors: number;
}

export async function processAutoResolveTick(now = new Date()): Promise<AutoResolveResult> {
  const result: AutoResolveResult = { organizations: 0, resolved: 0, messagesSent: 0, errors: 0 };
  const orgs = await prisma.organization.findMany({
    where: { autoResolveAfterHours: { not: null } },
    select: {
      id: true,
      autoResolveAfterHours: true,
      autoResolveMessage: true,
      autoResolveTagName: true,
      autoResolveSkipWaiting: true,
    },
  });

  for (const org of orgs) {
    const cutoff = autoResolveCutoff({ afterHours: org.autoResolveAfterHours, skipWaiting: org.autoResolveSkipWaiting }, now);
    if (!cutoff) continue;
    if (!(await isOrgWritable(org.id))) continue;
    result.organizations++;
    try {
      await resolveOrg(org, cutoff, now, result);
    } catch (error) {
      result.errors++;
      console.error(`[auto-resolve] falló la organización ${org.id}`, error);
    }
  }
  if (result.resolved > 0 || result.errors > 0) {
    console.log(`[auto-resolve] ${result.resolved} chats resueltos, ${result.messagesSent} avisos, ${result.errors} errores`);
  }
  return result;
}

type OrgConfig = {
  id: string;
  autoResolveMessage: string | null;
  autoResolveTagName: string | null;
  autoResolveSkipWaiting: boolean;
};

function candidateFilters(org: OrgConfig, cutoff: Date, now: Date) {
  return [
    { status: { in: ["OPEN", "PENDING"] as Array<"OPEN" | "PENDING"> } },
    { lastMessageAt: { lt: cutoff } },
    { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
    ...(org.autoResolveSkipWaiting ? [{ waitingSince: null }] : []),
  ];
}

async function resolveOrg(org: OrgConfig, cutoff: Date, now: Date, result: AutoResolveResult) {
  let budget = AUTO_RESOLVE_BATCH;

  const waWhere: Prisma.WAChatWhereInput = {
    account: { organizationId: org.id },
    AND: candidateFilters(org, cutoff, now),
  };
  const waChats = await prisma.wAChat.findMany({
    where: waWhere,
    orderBy: { lastMessageAt: "asc" },
    take: budget,
    select: { id: true, lastMessageAt: true },
  });
  for (const chat of waChats) {
    const claimed = await prisma.wAChat.updateMany({
      where: { id: chat.id, status: { in: ["OPEN", "PENDING"] }, lastMessageAt: chat.lastMessageAt },
      data: { status: "RESOLVED", resolvedAt: now, waitingSince: null },
    });
    if (claimed.count === 0) continue;
    budget--;
    result.resolved++;
    await afterResolved(org, { kind: "whatsapp", id: chat.id }, result);
  }
  if (budget <= 0) return;

  const channelWhere: Prisma.ConversationWhereInput = {
    channelAccount: { organizationId: org.id },
    AND: candidateFilters(org, cutoff, now),
  };
  const conversations = await prisma.conversation.findMany({
    where: channelWhere,
    orderBy: { lastMessageAt: "asc" },
    take: budget,
    select: { id: true, lastMessageAt: true },
  });
  for (const conversation of conversations) {
    const claimed = await prisma.conversation.updateMany({
      where: { id: conversation.id, status: { in: ["OPEN", "PENDING"] }, lastMessageAt: conversation.lastMessageAt },
      data: { status: "RESOLVED", resolvedAt: now, waitingSince: null },
    });
    if (claimed.count === 0) continue;
    result.resolved++;
    await afterResolved(org, { kind: "channel", id: conversation.id }, result);
  }
}

// Efectos posteriores, cada uno aislado: un fallo en la etiqueta o en el
// mensaje no deshace la resolución ni frena el resto del lote.
async function afterResolved(org: OrgConfig, chat: { kind: "whatsapp" | "channel"; id: string }, result: AutoResolveResult) {
  const refs = await eventRefsForChat(chat.id).catch(() => null);
  if (refs) await emitDomainEvent({ type: "conversation.resolved", ...refs, data: {} });

  if (org.autoResolveTagName && chat.kind === "whatsapp") {
    try {
      const row = await prisma.wAChat.findUnique({ where: { id: chat.id }, select: { accountId: true } });
      if (row) {
        const tag = await findOrCreateTag({ accountId: row.accountId, channelAccountId: null }, org.autoResolveTagName);
        await prisma.chatTag.upsert({
          where: { chatId_tagId: { chatId: chat.id, tagId: tag.id } },
          create: { chatId: chat.id, tagId: tag.id },
          update: {},
        });
        if (refs) await emitDomainEvent({ type: "tag.added", ...refs, data: { tagId: tag.id, tagName: tag.name, target: "conversation" } });
      }
    } catch (error) {
      result.errors++;
      console.error(`[auto-resolve] no se pudo etiquetar el chat ${chat.id}`, error);
    }
  }

  const text = org.autoResolveMessage?.trim();
  if (!text) return;
  try {
    if (chat.kind === "whatsapp") {
      const target = await prisma.wAChat.findUnique({ where: { id: chat.id }, include: { account: true } });
      if (!target) return;
      await sendOutbound({ kind: "whatsapp", chat: target }, { type: "text", text }, { source: "automation", countsAsReply: false });
    } else {
      const target = await prisma.conversation.findUnique({ where: { id: chat.id }, include: { channelAccount: true } });
      if (!target) return;
      await sendOutbound({ kind: "channel", conversation: target }, { type: "text", text }, { source: "automation", countsAsReply: false });
    }
    result.messagesSent++;
  } catch (error) {
    // Ventana de 24 h cerrada (lo normal tras horas de inactividad en
    // WhatsApp) o canal que rechaza: el chat ya quedó resuelto, solo no hay aviso.
    if (error instanceof OutboundError) return;
    result.errors++;
    console.error(`[auto-resolve] no se pudo mandar el aviso al chat ${chat.id}`, error);
  }
}
