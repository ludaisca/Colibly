import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { REPLY_ORIGINS, SESSION_GAP_MINUTES } from "./response-rules";

// Tiempo de primera respuesta resuelto EN LA BASE, con la misma definición que
// response-rules.ts:responseSamples() (la referencia probada): conversaciones
// iniciadas por el cliente desde `since` (y antes de `until`), una muestra por
// conversación respondida. Solo viajan a Node los minutos y quién respondió.

export interface ResponseRow {
  minutes: number;
  /** Persona que respondió (null: bot, API, automatización, app del teléfono). */
  responderId: string | null;
}

const replyOrigins = [...REPLY_ORIGINS];

function samplesQuery(conversational: Prisma.Sql, since: Date, until: Date | null) {
  // `msgs` = solo actividad de conversación (entrantes en vivo + salientes que
  // responden); `starts` = entrantes sin actividad en las 24 h previas, cada uno
  // con el inicio de la siguiente conversación (su respuesta tiene que llegar
  // antes). Se mira 24 h hacia atrás de `since` para saber si la primera
  // conversación del periodo empezó de verdad o venía de antes.
  return Prisma.sql`
    WITH msgs AS (${conversational}),
    ordered AS (
      SELECT chat_id, ts, inbound, LAG(ts) OVER (PARTITION BY chat_id ORDER BY ts) AS prev_ts FROM msgs
    ),
    starts AS (
      SELECT chat_id, ts, LEAD(ts) OVER (PARTITION BY chat_id ORDER BY ts) AS next_start
      FROM ordered
      WHERE inbound AND (prev_ts IS NULL OR ts - prev_ts > make_interval(mins => ${SESSION_GAP_MINUTES}::int))
    )
    SELECT DISTINCT ON (s.chat_id, s.ts)
      (extract(epoch FROM (r.ts - s.ts)) / 60)::float AS minutes, r.sender_id AS "responderId"
    FROM starts s
    JOIN msgs r ON r.chat_id = s.chat_id AND NOT r.inbound AND r.ts > s.ts AND (s.next_start IS NULL OR r.ts < s.next_start)
    WHERE s.ts >= ${since} ${until ? Prisma.sql`AND s.ts < ${until}` : Prisma.empty}
    ORDER BY s.chat_id, s.ts, r.ts`;
}

export async function firstResponseRows(
  accountIds: string[],
  channelAccountIds: string[],
  since: Date,
  until: Date | null = null
): Promise<ResponseRow[]> {
  const lookback = new Date(since.getTime() - SESSION_GAP_MINUTES * 60_000);
  const rows: ResponseRow[] = [];
  if (accountIds.length) {
    rows.push(
      ...(await prisma.$queryRaw<ResponseRow[]>(
        samplesQuery(
          Prisma.sql`
            SELECT m."chatId" AS chat_id, m.timestamp AS ts, (m.direction = 'INBOUND') AS inbound, m."senderId" AS sender_id
            FROM wa_messages m JOIN wa_chats c ON c.id = m."chatId"
            WHERE c."accountId" = ANY(${accountIds}) AND m.timestamp >= ${lookback} AND m.origin <> 'HISTORY'
              AND (m.direction = 'INBOUND' OR (m."campaignId" IS NULL AND m."leadSheetSourceId" IS NULL
                AND (m.sent_via IS NULL OR m.sent_via = ANY(${replyOrigins}))))`,
          since,
          until
        )
      ))
    );
  }
  if (channelAccountIds.length) {
    rows.push(
      ...(await prisma.$queryRaw<ResponseRow[]>(
        samplesQuery(
          Prisma.sql`
            SELECT m."conversationId" AS chat_id, m.timestamp AS ts, (m.direction = 'INBOUND') AS inbound, m."senderId" AS sender_id
            FROM channel_messages m JOIN conversations c ON c.id = m."conversationId"
            WHERE c."channelAccountId" = ANY(${channelAccountIds}) AND m.timestamp >= ${lookback}
              AND (m.direction = 'INBOUND' OR m.sent_via IS NULL OR m.sent_via = ANY(${replyOrigins}))`,
          since,
          until
        )
      ))
    );
  }
  return rows.map((row) => ({ minutes: Number(row.minutes), responderId: row.responderId }));
}

/** Minutos por persona que respondió (las respuestas de bot/API/app no son de nadie). */
export function minutesByResponder(rows: ResponseRow[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.responderId) continue;
    const list = out.get(row.responderId) ?? [];
    list.push(row.minutes);
    out.set(row.responderId, list);
  }
  return out;
}
