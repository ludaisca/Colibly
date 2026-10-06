import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/crm/errors";
import { isRestricted, type CrmActor } from "@/lib/crm/access";
import { accessibleContacts } from "@/lib/crm/people";
import { decodeMergeCursor, encodeMergeCursor, mergeTimeline, type SourcePosition, type TimelineEntry } from "@/lib/crm/task-rules";

// Línea de tiempo UNIFICADA de una persona: lo que el CRM registró (historial:
// altas, ediciones, negocios, tareas), los mensajes de todos sus canales, las
// notas y las citas que ya ocurrieron, de más nuevo a más viejo. Cada fuente se
// pagina con su propia posición (fecha, id) y se mezclan en memoria
// (`mergeTimeline`), así una persona con miles de mensajes no ahoga el resto.
//
// Los mensajes y notas respetan el acceso a la cuenta de cada canal: quien no
// puede ver el WhatsApp de la persona no ve su conversación aquí.

export const TIMELINE_KINDS = ["activity", "message", "note", "appointment"] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

const PREVIEW_CHARS = 240;

function preview(body: string | null, caption: string | null, messageType: string): string {
  const text = (body?.trim() || caption?.trim() || "").slice(0, PREVIEW_CHARS);
  return text || `[${messageType}]`;
}

type Entry = TimelineEntry & {
  kind: TimelineKind;
  type: string;
  actor: { id: string; name: string | null } | null;
  data: Record<string, unknown>;
};

// Condición de keyset "más viejo que la posición": (at, id) < (t, i).
function before<F extends string>(field: F, pos: SourcePosition | undefined): Record<string, unknown> {
  if (!pos) return {};
  const t = new Date(pos.t);
  return { OR: [{ [field]: { lt: t } }, { [field]: t, id: { lt: pos.i } }] };
}

export async function listTimeline(actor: CrmActor, personId: string, rawCursor: string | null, limit = 30, rawKinds?: string | null) {
  const person = await prisma.person.findFirst({ where: { id: personId, organizationId: actor.organizationId }, select: { id: true } });
  if (!person) throw notFound("Contacto");

  const take = Math.min(Math.max(Math.trunc(limit) || 30, 1), 100);
  const kinds = new Set<TimelineKind>(
    rawKinds ? rawKinds.split(",").map((k) => k.trim()).filter((k): k is TimelineKind => (TIMELINE_KINDS as readonly string[]).includes(k)) : TIMELINE_KINDS
  );
  if (!kinds.size) TIMELINE_KINDS.forEach((k) => kinds.add(k));
  const cursor = decodeMergeCursor(rawCursor);
  const scope = await accessibleContacts(actor);
  const contactWhere: Prisma.ContactWhereInput = { AND: [{ personId }, scope] };
  const now = new Date();
  const n = take + 1;
  const lists: Record<string, Entry[]> = {};

  const jobs: Promise<void>[] = [];

  if (kinds.has("activity")) {
    jobs.push(
      prisma.activityLog
        .findMany({
          where: { organizationId: actor.organizationId, personId, ...(before("createdAt", cursor.activity) as Prisma.ActivityLogWhereInput) },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: n,
          select: { id: true, type: true, data: true, createdAt: true, actor: { select: { id: true, name: true } } },
        })
        .then((rows) => {
          lists.activity = rows.map((r) => ({
            key: `activity:${r.id}`,
            source: "activity",
            id: r.id,
            at: r.createdAt,
            kind: "activity",
            type: r.type,
            actor: r.actor,
            data: (r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown>,
          }));
        })
    );
  }

  if (kinds.has("message")) {
    jobs.push(
      prisma.wAMessage
        .findMany({
          where: { chat: { contact: contactWhere }, ...(before("timestamp", cursor.wa_message) as Prisma.WAMessageWhereInput) },
          orderBy: [{ timestamp: "desc" }, { id: "desc" }],
          take: n,
          select: { id: true, direction: true, messageType: true, body: true, caption: true, timestamp: true, origin: true, chat: { select: { accountId: true, account: { select: { name: true } } } } },
        })
        .then((rows) => {
          lists.wa_message = rows.map((r) => ({
            key: `wa_message:${r.id}`,
            source: "wa_message",
            id: r.id,
            at: r.timestamp,
            kind: "message",
            type: r.direction === "INBOUND" ? "message.inbound" : "message.outbound",
            actor: null,
            data: { channel: "WHATSAPP", account: r.chat.account.name, messageType: r.messageType, text: preview(r.body, r.caption, r.messageType), origin: r.origin },
          }));
        }),
      prisma.channelMessage
        .findMany({
          where: { conversation: { contact: contactWhere }, ...(before("timestamp", cursor.channel_message) as Prisma.ChannelMessageWhereInput) },
          orderBy: [{ timestamp: "desc" }, { id: "desc" }],
          take: n,
          select: { id: true, direction: true, messageType: true, body: true, caption: true, timestamp: true, conversation: { select: { channelAccount: { select: { name: true, channel: true } } } } },
        })
        .then((rows) => {
          lists.channel_message = rows.map((r) => ({
            key: `channel_message:${r.id}`,
            source: "channel_message",
            id: r.id,
            at: r.timestamp,
            kind: "message",
            type: r.direction === "INBOUND" ? "message.inbound" : "message.outbound",
            actor: null,
            data: { channel: r.conversation.channelAccount.channel, account: r.conversation.channelAccount.name, messageType: r.messageType, text: preview(r.body, r.caption, r.messageType) },
          }));
        })
    );
  }

  if (kinds.has("note")) {
    jobs.push(
      prisma.wANote
        .findMany({
          where: { contact: contactWhere, ...(before("createdAt", cursor.note) as Prisma.WANoteWhereInput) },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: n,
          select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } },
        })
        .then((rows) => {
          lists.note = rows.map((r) => ({ key: `note:${r.id}`, source: "note", id: r.id, at: r.createdAt, kind: "note", type: "note", actor: r.author, data: { body: r.body } }));
        })
    );
  }

  if (kinds.has("appointment")) {
    // Solo las que ya llegaron a su hora: las próximas se ven en "Próximas".
    const restrictedWhere: Prisma.WAAppointmentWhereInput = isRestricted(actor) ? { assignedToId: actor.userId } : {};
    jobs.push(
      prisma.wAAppointment
        .findMany({
          where: { contact: contactWhere, scheduledAt: { lte: now }, ...restrictedWhere, ...(before("scheduledAt", cursor.appointment) as Prisma.WAAppointmentWhereInput) },
          orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
          take: n,
          select: { id: true, title: true, status: true, scheduledAt: true, durationMinutes: true, assignedTo: { select: { id: true, name: true } } },
        })
        .then((rows) => {
          lists.appointment = rows.map((r) => ({
            key: `appointment:${r.id}`,
            source: "appointment",
            id: r.id,
            at: r.scheduledAt,
            kind: "appointment",
            type: `appointment.${r.status.toLowerCase()}`,
            actor: r.assignedTo,
            data: { title: r.title, status: r.status, durationMinutes: r.durationMinutes },
          }));
        })
    );
  }

  await Promise.all(jobs);
  const merged = mergeTimeline(lists, take, cursor);
  return {
    items: merged.items.map(({ key, kind, type, at, actor: by, data }) => ({ key, kind, type, at, actor: by, data })),
    nextCursor: merged.nextCursor ? encodeMergeCursor(merged.nextCursor) : null,
  };
}
