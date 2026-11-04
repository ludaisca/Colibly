import { prisma } from "@/lib/prisma";
import type { ApiContext } from "./auth";
import { MESSAGE_SERIALIZE_SELECT_CHANNEL, MESSAGE_SERIALIZE_SELECT_WA, resolveReplyIds, serializeMessage, type PublicMessage } from "@/lib/messages/serialize";

// Lectura de mensajes fuera de una conversación concreta (API pública):
// el listado global para sincronizar (`GET /messages?since=`) y un mensaje por
// id (`GET /messages/{id}`, p. ej. para releerlo tras un webhook). Siempre
// acotado a las cuentas de la key.

type WaRow = Awaited<ReturnType<typeof loadWa>>[number];
type ChRow = Awaited<ReturnType<typeof loadCh>>[number];

const WA_SELECT = { ...MESSAGE_SERIALIZE_SELECT_WA, chatId: true } as const;
const CH_SELECT = { ...MESSAGE_SERIALIZE_SELECT_CHANNEL, conversationId: true } as const;

function loadWa(where: object, take: number) {
  return prisma.wAMessage.findMany({ where, select: WA_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take });
}
function loadCh(where: object, take: number) {
  return prisma.channelMessage.findMany({ where, select: CH_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take });
}

// Serializa resolviendo las citas en una consulta por conversación.
async function serializeRows(wa: WaRow[], ch: ChRow[]): Promise<Map<string, PublicMessage>> {
  const out = new Map<string, PublicMessage>();
  const groups: [("whatsapp" | "channel"), string, (WaRow | ChRow)[]][] = [];
  const byChat = new Map<string, WaRow[]>();
  for (const r of wa) byChat.set(r.chatId, [...(byChat.get(r.chatId) ?? []), r]);
  for (const [id, rows] of byChat) groups.push(["whatsapp", id, rows]);
  const byConv = new Map<string, ChRow[]>();
  for (const r of ch) byConv.set(r.conversationId, [...(byConv.get(r.conversationId) ?? []), r]);
  for (const [id, rows] of byConv) groups.push(["channel", id, rows]);

  await Promise.all(
    groups.map(async ([kind, conversationId, rows]) => {
      const replies = await resolveReplyIds(kind, conversationId, rows);
      for (const m of rows) {
        const ext = ("replyToWamid" in m ? m.replyToWamid : null) ?? ("replyToExternalId" in m ? m.replyToExternalId : null);
        out.set(m.id, serializeMessage(m, conversationId, { replyToMessageId: ext ? replies.get(ext) ?? null : null }));
      }
    })
  );
  return out;
}

export interface FeedFilters {
  since: Date;
  after: { t: Date; id: string } | null;
  limit: number;
  accountId: string | null;
  direction: "INBOUND" | "OUTBOUND" | null;
}

// Mensajes guardados desde `since` en todas las conversaciones de la key, del
// más viejo al más nuevo por (createdAt, id). Las dos tablas se piden con el
// mismo keyset y se mezclan, igual que GET /conversations.
export async function messagesFeed(ctx: ApiContext, f: FeedFilters): Promise<{ data: PublicMessage[]; nextCursor: { t: Date; id: string } | null }> {
  const waIds = f.accountId ? ctx.accountIds.filter((id) => id === f.accountId) : ctx.accountIds;
  const chIds = f.accountId ? ctx.channelAccountIds.filter((id) => id === f.accountId) : ctx.channelAccountIds;
  const common = {
    createdAt: { gte: f.since },
    ...(f.direction ? { direction: f.direction } : {}),
    ...(f.after ? { OR: [{ createdAt: { gt: f.after.t } }, { createdAt: f.after.t, id: { gt: f.after.id } }] } : {}),
  };
  const [wa, ch] = await Promise.all([
    waIds.length ? loadWa({ ...common, chat: { accountId: { in: waIds } } }, f.limit + 1) : [],
    chIds.length ? loadCh({ ...common, conversation: { channelAccountId: { in: chIds } } }, f.limit + 1) : [],
  ]);
  const merged = [...wa, ...ch].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
  const page = merged.slice(0, f.limit);
  const pageIds = new Set(page.map((m) => m.id));
  const serialized = await serializeRows(
    wa.filter((m) => pageIds.has(m.id)),
    ch.filter((m) => pageIds.has(m.id))
  );
  const last = page[page.length - 1];
  return {
    data: page.map((m) => serialized.get(m.id)!),
    nextCursor: merged.length > f.limit && last ? { t: last.createdAt, id: last.id } : null,
  };
}

export async function findScopedMessage(ctx: ApiContext, id: string): Promise<PublicMessage | null> {
  const wa = ctx.accountIds.length ? await prisma.wAMessage.findFirst({ where: { id, chat: { accountId: { in: ctx.accountIds } } }, select: WA_SELECT }) : null;
  if (wa) return (await serializeRows([wa], [])).get(wa.id) ?? null;
  const ch = ctx.channelAccountIds.length
    ? await prisma.channelMessage.findFirst({ where: { id, conversation: { channelAccountId: { in: ctx.channelAccountIds } } }, select: CH_SELECT })
    : null;
  if (ch) return (await serializeRows([], [ch])).get(ch.id) ?? null;
  return null;
}
