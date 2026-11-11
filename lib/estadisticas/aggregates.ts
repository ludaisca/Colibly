import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mergeAgentRows, type AgentAggregateRow } from "./aggregate-rules";

// Agregados de Estadísticas resueltos EN LA BASE. Antes se traían a Node todos
// los mensajes de 14 días, todos los chats asignados y todos los mensajes con
// campaña de cada chat calificado solo para contarlos: en un workspace con
// miles de chats la página no terminaba de cargar. Aquí cada consulta devuelve
// unas pocas filas (una por día, por agente o por chat calificado).

/** Mensajes por día (fecha en `timeZone`) desde `since`, WhatsApp + demás canales. */
export async function dailyMessageCounts(
  accountIds: string[],
  channelAccountIds: string[],
  since: Date,
  timeZone: string
): Promise<Record<string, number>> {
  const rows: Array<{ day: string; count: number }> = [];
  if (accountIds.length) {
    rows.push(
      ...(await prisma.$queryRaw<Array<{ day: string; count: number }>>(Prisma.sql`
        SELECT to_char((m.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day, count(*)::int AS count
        FROM wa_messages m JOIN wa_chats c ON c.id = m."chatId"
        WHERE m.created_at >= ${since} AND c."accountId" = ANY(${accountIds})
        GROUP BY 1`))
    );
  }
  if (channelAccountIds.length) {
    rows.push(
      ...(await prisma.$queryRaw<Array<{ day: string; count: number }>>(Prisma.sql`
        SELECT to_char((m.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day, count(*)::int AS count
        FROM channel_messages m JOIN conversations c ON c.id = m."conversationId"
        WHERE m.created_at >= ${since} AND c."channelAccountId" = ANY(${channelAccountIds})
        GROUP BY 1`))
    );
  }
  const out: Record<string, number> = {};
  for (const r of rows) out[r.day] = (out[r.day] ?? 0) + Number(r.count);
  return out;
}

/** Desempeño por agente: resueltos y promedios de primera respuesta/resolución (minutos). */
export async function agentAggregates(accountIds: string[], channelAccountIds: string[]) {
  const query = (table: "wa_chats" | "conversations", column: "accountId" | "channelAccountId", ids: string[]) =>
    prisma.$queryRaw<AgentAggregateRow[]>(Prisma.sql`
      SELECT "assignedToId" AS "userId",
        count(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved,
        coalesce(sum(extract(epoch FROM ("firstResponseAt" - created_at)) / 60) FILTER (WHERE "firstResponseAt" IS NOT NULL), 0)::float AS "responseSum",
        count("firstResponseAt")::int AS "responseCount",
        coalesce(sum(extract(epoch FROM ("resolvedAt" - created_at)) / 60) FILTER (WHERE "resolvedAt" IS NOT NULL), 0)::float AS "resolutionSum",
        count("resolvedAt")::int AS "resolutionCount"
      FROM ${Prisma.raw(table)}
      WHERE "assignedToId" IS NOT NULL AND ${Prisma.raw(`"${column}"`)} = ANY(${ids})
      GROUP BY 1`);
  const rows = [
    ...(accountIds.length ? await query("wa_chats", "accountId", accountIds) : []),
    ...(channelAccountIds.length ? await query("conversations", "channelAccountId", channelAccountIds) : []),
  ];
  const merged = mergeAgentRows(rows);
  const users = merged.length
    ? await prisma.user.findMany({ where: { id: { in: merged.map((m) => m.userId) } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return merged.map((m) => ({ ...m, userName: nameById.get(m.userId) ?? null }));
}

export interface QualifiedChatRow {
  key: string;
  score: number;
  label: string;
  campaign: { id: string; name: string; origin: "manual" | "automatizacion" } | null;
}

/**
 * La mejor calificación de cada chat (WhatsApp y canales) y, en WhatsApp, la
 * campaña o fuente de leads del último mensaje que la trae. DISTINCT ON en
 * lugar de `take: 1` anidado: Prisma resolvía ese take leyendo TODOS los
 * mensajes con campaña de cada chat y recortando en memoria.
 */
export async function qualifiedChatRows(accountIds: string[], channelAccountIds: string[]): Promise<QualifiedChatRow[]> {
  const wa = accountIds.length
    ? await prisma.$queryRaw<Array<{ chatId: string; score: number; label: string }>>(Prisma.sql`
        SELECT DISTINCT ON (s."chatId") s."chatId", s.score, s.label
        FROM wa_lead_scores s JOIN wa_chats c ON c.id = s."chatId"
        WHERE c."accountId" = ANY(${accountIds})
        ORDER BY s."chatId", s.score DESC`)
    : [];
  const channel = channelAccountIds.length
    ? await prisma.$queryRaw<Array<{ conversationId: string; score: number; label: string }>>(Prisma.sql`
        SELECT DISTINCT ON (s."conversationId") s."conversationId", s.score, s.label
        FROM wa_lead_scores s JOIN conversations c ON c.id = s."conversationId"
        WHERE c."channelAccountId" = ANY(${channelAccountIds})
        ORDER BY s."conversationId", s.score DESC`)
    : [];

  const chatIds = wa.map((r) => r.chatId);
  const attribution = chatIds.length
    ? await prisma.$queryRaw<Array<{ chatId: string; campaignId: string | null; leadSheetSourceId: string | null }>>(Prisma.sql`
        SELECT DISTINCT ON (m."chatId") m."chatId", m."campaignId", m."leadSheetSourceId"
        FROM wa_messages m
        WHERE m."chatId" = ANY(${chatIds}) AND (m."campaignId" IS NOT NULL OR m."leadSheetSourceId" IS NOT NULL)
        ORDER BY m."chatId", m.timestamp DESC`)
    : [];
  const campaignIds = [...new Set(attribution.map((a) => a.campaignId).filter((x): x is string => !!x))];
  const sourceIds = [...new Set(attribution.map((a) => a.leadSheetSourceId).filter((x): x is string => !!x))];
  const [campaigns, sources] = await Promise.all([
    campaignIds.length ? prisma.wACampaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, name: true } }) : [],
    sourceIds.length ? prisma.leadSheetSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, name: true } }) : [],
  ]);
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const sourceName = new Map(sources.map((s) => [s.id, s.name]));
  const attributionByChat = new Map(attribution.map((a) => [a.chatId, a]));

  return [
    ...wa.map((r) => {
      const a = attributionByChat.get(r.chatId);
      const campaign = a?.campaignId && campaignName.has(a.campaignId)
        ? { id: a.campaignId, name: campaignName.get(a.campaignId)!, origin: "manual" as const }
        : a?.leadSheetSourceId && sourceName.has(a.leadSheetSourceId)
          ? { id: a.leadSheetSourceId, name: sourceName.get(a.leadSheetSourceId)!, origin: "automatizacion" as const }
          : null;
      return { key: `wa:${r.chatId}`, score: Number(r.score), label: r.label, campaign };
    }),
    ...channel.map((r) => ({ key: `ch:${r.conversationId}`, score: Number(r.score), label: r.label, campaign: null })),
  ];
}
