import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeTimeZone } from "@/lib/dates/zoned";
import { buildHeatmapGrid, type HeatmapGrid } from "./heatmap-rules";

export * from "./heatmap-rules";

export interface ActivityHeatmap {
  timeZone: string;
  inbound: HeatmapGrid;
  resolved: HeatmapGrid;
}

type Row = { dow: number; hour: number; count: bigint };

// Las columnas son `timestamp` sin zona guardadas en UTC: primero se marcan
// como UTC y luego se convierten a la zona de la organización. Un solo
// `AT TIME ZONE tz` las interpretaría como hora local de tz (desfase de 6 h).
function local(column: Prisma.Sql, tz: string): Prisma.Sql {
  return Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${tz})`;
}

export async function getActivityHeatmap(
  scope: { waAccountIds: string[]; channelAccountIds: string[] },
  range: { from: Date; to: Date },
  timeZone: string
): Promise<ActivityHeatmap> {
  const tz = safeTimeZone(timeZone);
  const waIds = scope.waAccountIds.length ? scope.waAccountIds : ["__none__"];
  const chIds = scope.channelAccountIds.length ? scope.channelAccountIds : ["__none__"];
  const mts = local(Prisma.sql`m.timestamp`, tz);
  const rts = local(Prisma.sql`c."resolvedAt"`, tz);

  const [inbound, resolved] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT dow, hour, sum(n)::bigint AS count FROM (
        SELECT EXTRACT(dow FROM ${mts})::int AS dow, EXTRACT(hour FROM ${mts})::int AS hour, count(*) AS n
        FROM wa_messages m JOIN wa_chats c ON c.id = m."chatId"
        WHERE c."accountId" IN (${Prisma.join(waIds)}) AND m.direction = 'INBOUND'
          AND m.timestamp >= ${range.from} AND m.timestamp < ${range.to}
        GROUP BY 1, 2
        UNION ALL
        SELECT EXTRACT(dow FROM ${mts})::int, EXTRACT(hour FROM ${mts})::int, count(*)
        FROM channel_messages m JOIN conversations c ON c.id = m."conversationId"
        WHERE c."channelAccountId" IN (${Prisma.join(chIds)}) AND m.direction = 'INBOUND'
          AND m.timestamp >= ${range.from} AND m.timestamp < ${range.to}
        GROUP BY 1, 2
      ) t GROUP BY dow, hour`,
    prisma.$queryRaw<Row[]>`
      SELECT dow, hour, sum(n)::bigint AS count FROM (
        SELECT EXTRACT(dow FROM ${rts})::int AS dow, EXTRACT(hour FROM ${rts})::int AS hour, count(*) AS n
        FROM wa_chats c
        WHERE c."accountId" IN (${Prisma.join(waIds)}) AND c."resolvedAt" >= ${range.from} AND c."resolvedAt" < ${range.to}
        GROUP BY 1, 2
        UNION ALL
        SELECT EXTRACT(dow FROM ${rts})::int, EXTRACT(hour FROM ${rts})::int, count(*)
        FROM conversations c
        WHERE c."channelAccountId" IN (${Prisma.join(chIds)}) AND c."resolvedAt" >= ${range.from} AND c."resolvedAt" < ${range.to}
        GROUP BY 1, 2
      ) t GROUP BY dow, hour`,
  ]);

  const toRows = (rows: Row[]) => rows.map((row) => ({ dow: row.dow, hour: row.hour, count: Number(row.count) }));
  return { timeZone: tz, inbound: buildHeatmapGrid(toRows(inbound)), resolved: buildHeatmapGrid(toRows(resolved)) };
}
