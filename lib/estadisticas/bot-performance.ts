import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { summarizeBotPerformance, type BotChatRow, type BotPerformance } from "./bot-performance-rules";

export * from "./bot-performance-rules";

type Row = { bot_replies: bigint; resolved: boolean; human_after_bot: boolean; csat: number | null };

/**
 * Una fila por chat con respuestas del bot en el periodo, en las cuentas que el
 * usuario ve. WhatsApp + canales; CSAT solo existe en WhatsApp.
 */
export async function getBotPerformance(
  scope: { waAccountIds: string[]; channelAccountIds: string[] },
  range: { from: Date; to: Date }
): Promise<BotPerformance> {
  const waIds = scope.waAccountIds.length ? scope.waAccountIds : ["__none__"];
  const chIds = scope.channelAccountIds.length ? scope.channelAccountIds : ["__none__"];

  const [wa, ch] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      WITH bot AS (
        SELECT u."waChatId" AS chat_id, min(u.created_at) AS first_bot, count(*) AS bot_replies
        FROM wa_bot_usage u JOIN wa_chats c ON c.id = u."waChatId"
        WHERE c."accountId" IN (${Prisma.join(waIds)}) AND u.created_at >= ${range.from} AND u.created_at < ${range.to}
        GROUP BY u."waChatId"
      )
      SELECT bot.bot_replies, (c.status = 'RESOLVED') AS resolved,
        EXISTS (SELECT 1 FROM wa_messages m WHERE m."chatId" = bot.chat_id AND m.direction = 'OUTBOUND'
                AND m."senderId" IS NOT NULL AND m.timestamp > bot.first_bot) AS human_after_bot,
        s.rating AS csat
      FROM bot JOIN wa_chats c ON c.id = bot.chat_id
      LEFT JOIN csat_responses s ON s.chat_id = bot.chat_id`,
    prisma.$queryRaw<Row[]>`
      WITH bot AS (
        SELECT u."conversationId" AS chat_id, min(u.created_at) AS first_bot, count(*) AS bot_replies
        FROM wa_bot_usage u JOIN conversations c ON c.id = u."conversationId"
        WHERE c."channelAccountId" IN (${Prisma.join(chIds)}) AND u.created_at >= ${range.from} AND u.created_at < ${range.to}
        GROUP BY u."conversationId"
      )
      SELECT bot.bot_replies, (c.status = 'RESOLVED') AS resolved,
        EXISTS (SELECT 1 FROM channel_messages m WHERE m."conversationId" = bot.chat_id AND m.direction = 'OUTBOUND'
                AND m."senderId" IS NOT NULL AND m.timestamp > bot.first_bot) AS human_after_bot,
        NULL::int AS csat
      FROM bot JOIN conversations c ON c.id = bot.chat_id`,
  ]);

  const rows: BotChatRow[] = [...wa, ...ch].map((row) => ({
    botReplies: Number(row.bot_replies),
    resolved: row.resolved,
    humanAfterBot: row.human_after_bot,
    csat: row.csat === null ? null : Number(row.csat),
  }));
  return summarizeBotPerformance(rows);
}
