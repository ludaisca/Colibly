import { displayName } from "@/lib/chats/display-name";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { escapeLikePattern, messageSnippet } from "./message-rules";

export { MESSAGE_SEARCH_MIN, MESSAGE_SEARCH_MAX, escapeLikePattern, messageSnippet, normalizeMessageQuery } from "./message-rules";

// Búsqueda dentro de los mensajes (benchmark #2). Usa los índices trigram de
// prisma/sql/ensure-search-indexes.sql: la expresión de abajo debe ser
// IDÉNTICA a la del índice o Postgres hace un scan completo. El alcance va
// siempre en el WHERE (ids de cuentas que el llamador ya resolvió con
// getUserAccountIds/getUserChannelAccountIds).

const SEARCH_EXPR = Prisma.sql`(coalesce(m.body, '') || ' ' || coalesce(m.caption, '') || ' ' || coalesce(m.transcript, ''))`;

export const MESSAGE_SEARCH_LIMIT = 30;

export interface MessageSearchHit {
  messageId: string;
  chatId: string;
  /** WAAccount o ChannelAccount del chat: arma la URL /whatsapp/chat/[accountId]/[chatId]. */
  accountId: string;
  channel: "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT" | "WHATSAPP_WEB";
  direction: "INBOUND" | "OUTBOUND";
  snippet: string;
  timestamp: string;
  chatName: string;
}

interface Row {
  id: string;
  chat_id: string;
  accountId: string;
  channel: MessageSearchHit["channel"];
  direction: MessageSearchHit["direction"];
  body: string | null;
  caption: string | null;
  transcript: string | null;
  timestamp: Date;
  chat_name: string | null;
  contact_name: string | null;
  handle: string;
}

export async function searchMessages(
  query: string,
  scope: { waAccountIds: string[]; channelAccountIds: string[] },
  limit = MESSAGE_SEARCH_LIMIT
): Promise<MessageSearchHit[]> {
  const pattern = `%${escapeLikePattern(query)}%`;
  const [wa, ch] = await Promise.all([
    scope.waAccountIds.length
      ? prisma.$queryRaw<Row[]>`
          SELECT m.id, m."chatId" AS chat_id, c."accountId" AS "accountId", 'WHATSAPP' AS channel, m.direction::text AS direction,
                 m.body, m.caption, m.transcript, m.timestamp,
                 c.name AS chat_name, ct.name AS contact_name, c."remoteJid" AS handle
          FROM wa_messages m
          JOIN wa_chats c ON c.id = m."chatId"
          LEFT JOIN contacts ct ON ct.id = c."contactId"
          WHERE c."accountId" IN (${Prisma.join(scope.waAccountIds)})
            AND m."messageType" <> 'reaction'
            AND ${SEARCH_EXPR} ILIKE ${pattern} ESCAPE '\\'
          ORDER BY m.timestamp DESC
          LIMIT ${limit}`
      : Promise.resolve([] as Row[]),
    scope.channelAccountIds.length
      ? prisma.$queryRaw<Row[]>`
          SELECT m.id, m."conversationId" AS chat_id, c."channelAccountId" AS "accountId", a.channel::text AS channel, m.direction::text AS direction,
                 m.body, m.caption, m.transcript, m.timestamp,
                 c.name AS chat_name, ct.name AS contact_name, c."externalId" AS handle
          FROM channel_messages m
          JOIN conversations c ON c.id = m."conversationId"
          JOIN channel_accounts a ON a.id = c."channelAccountId"
          LEFT JOIN contacts ct ON ct.id = c."contactId"
          WHERE c."channelAccountId" IN (${Prisma.join(scope.channelAccountIds)})
            AND ${SEARCH_EXPR} ILIKE ${pattern} ESCAPE '\\'
          ORDER BY m.timestamp DESC
          LIMIT ${limit}`
      : Promise.resolve([] as Row[]),
  ]);

  return [...wa, ...ch]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit)
    .map((row) => ({
      messageId: row.id,
      chatId: row.chat_id,
      accountId: row.accountId,
      channel: row.channel,
      direction: row.direction,
      snippet: messageSnippet([row.body, row.caption, row.transcript], query),
      timestamp: row.timestamp.toISOString(),
      chatName: displayName(row.contact_name || row.chat_name, row.handle),
    }));
}
