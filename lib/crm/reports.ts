import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/crm/errors";
import { isRestricted, type CrmActor } from "@/lib/crm/access";
import { roundMoney } from "@/lib/crm/deal-rules";
import { ensureDefaultPipeline } from "@/lib/crm/pipelines";
import {
  buildFunnel,
  defaultGranularity,
  forecastBucket,
  previousPeriod,
  rate,
  resolvePeriod,
  winRate,
  type Granularity,
  type Period,
  type VisitGroup,
} from "@/lib/crm/report-rules";
import { localDayStart, safeTimeZone } from "@/lib/crm/task-rules";

// Reportes del CRM: embudo, resumen de ventas, por responsable, por origen y
// anuncio, motivos de pérdida, tendencia y pronóstico. Todo es de SOLO LECTURA,
// se calcula en la base (agregados SQL) y se limita a la organización; el
// ejecutivo solo ve sus propios negocios. Los importes están en la moneda de la
// organización. Los negocios archivados no cuentan.
//
// Dos criterios de periodo, a propósito:
//  - rendimiento (resumen, responsables, motivos, tendencia de ganados/perdidos):
//    por FECHA DE CIERRE de los negocios;
//  - atribución y embudo (origen/anuncio, embudo): por COHORTE, los negocios
//    CREADOS en el periodo y lo que fue de ellos hasta hoy.

export const reportFiltersSchema = z.object({
  pipelineId: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(), // id | "none" | "me"
  leadOrigin: z.enum(["ORGANIC", "INSTANT_FORM", "CTWA"]).optional(),
  adId: z.string().min(1).max(200).optional(),
  granularity: z.enum(["day", "week", "month"]).optional(),
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

interface Ctx {
  actor: CrmActor;
  f: ReportFilters;
  tz: string;
  currency: string;
  period: Period;
  now: Date;
}

async function loadCtx(actor: CrmActor, raw: unknown, opts: { defaultPipeline?: boolean } = {}): Promise<Ctx> {
  const f = reportFiltersSchema.parse(raw ?? {});
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true, currency: true } });
  const tz = safeTimeZone(org.timezone);
  const now = new Date();
  const period = resolvePeriod({ from: f.from, to: f.to }, tz, now);
  if (f.pipelineId) {
    const ok = await prisma.pipeline.findFirst({ where: { id: f.pipelineId, organizationId: actor.organizationId }, select: { id: true } });
    if (!ok) throw notFound("Pipeline");
  } else if (opts.defaultPipeline) {
    f.pipelineId = (await ensureDefaultPipeline(actor.organizationId)).pipelineId;
  }
  return { actor, f, tz, currency: org.currency, period, now };
}

// Instante → timestamp sin zona en UTC (como están guardadas las columnas).
const ts = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

// Filtros comunes sobre `deals d`: organización, no archivados, pipeline,
// responsable (el ejecutivo siempre el suyo), origen y anuncio.
function dealWhere(c: Ctx): Prisma.Sql {
  const owner =
    isRestricted(c.actor) || c.f.ownerId === "me"
      ? Prisma.sql`AND d.owner_id = ${c.actor.userId}`
      : c.f.ownerId === "none"
        ? Prisma.sql`AND d.owner_id IS NULL`
        : c.f.ownerId
          ? Prisma.sql`AND d.owner_id = ${c.f.ownerId}`
          : Prisma.empty;
  return Prisma.sql`d.organization_id = ${c.actor.organizationId} AND d.archived_at IS NULL
    ${c.f.pipelineId ? Prisma.sql`AND d.pipeline_id = ${c.f.pipelineId}` : Prisma.empty}
    ${owner}
    ${c.f.leadOrigin ? Prisma.sql`AND d.lead_origin = ${c.f.leadOrigin}::"LeadOrigin"` : Prisma.empty}
    ${c.f.adId ? Prisma.sql`AND d.ad_id = ${c.f.adId}` : Prisma.empty}`;
}

const inPeriod = (col: string, p: Period) => Prisma.sql`${Prisma.raw(col)} >= ${ts(p.from)} AND ${Prisma.raw(col)} < ${ts(p.to)}`;
const money = (n: unknown) => roundMoney(Number(n ?? 0));
const WEIGHTED = Prisma.sql`d.amount * COALESCE(d.probability, s.probability) / 100.0`;

function periodOut(p: Period) {
  return { from: p.from.toISOString(), to: p.to.toISOString() };
}

// ── Resumen de ventas ───────────────────────────────────────────────────────

interface FlowRow {
  created: number;
  created_amount: number;
  won: number;
  won_amount: number;
  lost: number;
  lost_amount: number;
  avg_cycle: number | null;
  median_cycle: number | null;
}

async function flow(c: Ctx, p: Period) {
  const [r] = await prisma.$queryRaw<FlowRow[]>`
    SELECT COUNT(*) FILTER (WHERE ${inPeriod("d.created_at", p)})::int AS created,
           COALESCE(SUM(d.amount) FILTER (WHERE ${inPeriod("d.created_at", p)}), 0)::float8 AS created_amount,
           COUNT(*) FILTER (WHERE d.status = 'WON' AND ${inPeriod("d.closed_at", p)})::int AS won,
           COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'WON' AND ${inPeriod("d.closed_at", p)}), 0)::float8 AS won_amount,
           COUNT(*) FILTER (WHERE d.status = 'LOST' AND ${inPeriod("d.closed_at", p)})::int AS lost,
           COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'LOST' AND ${inPeriod("d.closed_at", p)}), 0)::float8 AS lost_amount,
           (AVG(EXTRACT(EPOCH FROM (d.closed_at - d.created_at))) FILTER (WHERE d.status = 'WON' AND ${inPeriod("d.closed_at", p)}))::float8 AS avg_cycle,
           (percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (d.closed_at - d.created_at))) FILTER (WHERE d.status = 'WON' AND ${inPeriod("d.closed_at", p)}))::float8 AS median_cycle
    FROM deals d WHERE ${dealWhere(c)}`;
  const day = 86_400;
  return {
    created: { count: r.created, amount: money(r.created_amount) },
    won: { count: r.won, amount: money(r.won_amount), averageAmount: r.won ? money(r.won_amount / r.won) : null },
    lost: { count: r.lost, amount: money(r.lost_amount) },
    winRate: winRate(r.won, r.lost),
    // Ciclo de venta: de que se abrió el negocio a que se ganó.
    cycleDays: { average: r.avg_cycle === null ? null : Math.round((r.avg_cycle / day) * 10) / 10, median: r.median_cycle === null ? null : Math.round((r.median_cycle / day) * 10) / 10 },
  };
}

export async function getSummary(actor: CrmActor, raw: unknown) {
  const c = await loadCtx(actor, raw);
  const prev = previousPeriod(c.period);
  const [current, previous, [open]] = await Promise.all([
    flow(c, c.period),
    flow(c, prev),
    prisma.$queryRaw<Array<{ count: number; amount: number; weighted: number }>>`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(d.amount), 0)::float8 AS amount, COALESCE(SUM(${WEIGHTED}), 0)::float8 AS weighted
      FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id WHERE ${dealWhere(c)} AND d.status = 'OPEN'`,
  ]);
  return {
    currency: c.currency,
    period: periodOut(c.period),
    previousPeriod: periodOut(prev),
    current,
    previous,
    // Foto de hoy (no depende del periodo).
    open: { count: open.count, amount: money(open.amount), weighted: money(open.weighted) },
  };
}

// ── Embudo ──────────────────────────────────────────────────────────────────

export async function getFunnel(actor: CrmActor, raw: unknown) {
  const c = await loadCtx(actor, raw, { defaultPipeline: true });
  const pipelineId = c.f.pipelineId!;
  const stages = await prisma.pipelineStage.findMany({ where: { pipelineId }, orderBy: { position: "asc" }, select: { id: true, name: true, color: true, outcome: true, position: true } });
  const open = stages.filter((s) => s.outcome === "OPEN");

  const [groups, dwell, current] = await Promise.all([
    prisma.$queryRaw<Array<{ max_open_pos: number | null; ever_won: boolean; count: number }>>`
      WITH cohort AS (SELECT d.id FROM deals d WHERE ${dealWhere(c)} AND ${inPeriod("d.created_at", c.period)}),
      v AS (
        SELECT c.id,
               MAX(CASE WHEN s.outcome = 'OPEN' THEN s.position END) AS max_open_pos,
               COALESCE(BOOL_OR(sc.to_status = 'WON'), false) AS ever_won
        FROM cohort c
        LEFT JOIN deal_stage_changes sc ON sc.deal_id = c.id
        LEFT JOIN pipeline_stages s ON s.id = sc.to_stage_id AND s.pipeline_id = ${pipelineId}
        GROUP BY c.id)
      SELECT max_open_pos, ever_won, COUNT(*)::int AS count FROM v GROUP BY 1, 2`,
    // Tiempo que los negocios pasaron en cada etapa antes de salir (movimientos del periodo).
    prisma.$queryRaw<Array<{ stage_id: string; n: number; avg_s: number; median_s: number }>>`
      SELECT sc.from_stage_id AS stage_id, COUNT(*)::int AS n, AVG(sc.seconds_in_from)::float8 AS avg_s,
             (percentile_cont(0.5) WITHIN GROUP (ORDER BY sc.seconds_in_from))::float8 AS median_s
      FROM deal_stage_changes sc JOIN deals d ON d.id = sc.deal_id
      WHERE ${dealWhere(c)} AND sc.from_stage_id IS NOT NULL AND sc.seconds_in_from IS NOT NULL AND ${inPeriod("sc.created_at", c.period)}
      GROUP BY sc.from_stage_id`,
    // Lo que hay hoy en cada etapa y cuánto lleva ahí: dónde se atoran.
    prisma.$queryRaw<Array<{ stage_id: string; n: number; amount: number; avg_age: number | null }>>`
      SELECT d.stage_id, COUNT(*)::int AS n, COALESCE(SUM(d.amount), 0)::float8 AS amount,
             AVG(EXTRACT(EPOCH FROM (${ts(c.now)} - d.stage_entered_at)))::float8 AS avg_age
      FROM deals d WHERE ${dealWhere(c)} AND d.status = 'OPEN' GROUP BY d.stage_id`,
  ]);

  const funnel = buildFunnel(
    open.map((s) => ({ id: s.id, name: s.name, position: s.position })),
    groups.map((g): VisitGroup => ({ maxOpenPosition: g.max_open_pos, everWon: g.ever_won, count: g.count }))
  );
  const dwellBy = new Map(dwell.map((d) => [d.stage_id, d]));
  const currentBy = new Map(current.map((d) => [d.stage_id, d]));
  const color = new Map(stages.map((s) => [s.id, s.color]));
  const day = 86_400;
  return {
    currency: c.currency,
    pipelineId,
    period: periodOut(c.period),
    cohort: funnel.total,
    stages: funnel.rows.map((r) => {
      const dw = r.stageId ? dwellBy.get(r.stageId) : undefined;
      const cur = r.stageId ? currentBy.get(r.stageId) : undefined;
      return {
        ...r,
        color: r.stageId ? color.get(r.stageId) ?? "info" : "success",
        daysInStage: dw ? { average: Math.round((dw.avg_s / day) * 10) / 10, median: Math.round((dw.median_s / day) * 10) / 10, samples: dw.n } : null,
        openNow: cur ? { count: cur.n, amount: money(cur.amount), averageAgeDays: cur.avg_age === null ? null : Math.round((cur.avg_age / day) * 10) / 10 } : { count: 0, amount: 0, averageAgeDays: null },
      };
    }),
  };
}

// ── Por responsable ─────────────────────────────────────────────────────────

export async function getOwnersReport(actor: CrmActor, raw: unknown) {
  const c = await loadCtx(actor, raw);
  const rows = await prisma.$queryRaw<
    Array<{ owner_id: string | null; open_count: number; open_amount: number; weighted: number; won_count: number; won_amount: number; lost_count: number; lost_amount: number; avg_cycle: number | null }>
  >`
    SELECT d.owner_id,
           COUNT(*) FILTER (WHERE d.status = 'OPEN')::int AS open_count,
           COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'OPEN'), 0)::float8 AS open_amount,
           COALESCE(SUM(${WEIGHTED}) FILTER (WHERE d.status = 'OPEN'), 0)::float8 AS weighted,
           COUNT(*) FILTER (WHERE d.status = 'WON' AND ${inPeriod("d.closed_at", c.period)})::int AS won_count,
           COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'WON' AND ${inPeriod("d.closed_at", c.period)}), 0)::float8 AS won_amount,
           COUNT(*) FILTER (WHERE d.status = 'LOST' AND ${inPeriod("d.closed_at", c.period)})::int AS lost_count,
           COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'LOST' AND ${inPeriod("d.closed_at", c.period)}), 0)::float8 AS lost_amount,
           (AVG(EXTRACT(EPOCH FROM (d.closed_at - d.created_at))) FILTER (WHERE d.status = 'WON' AND ${inPeriod("d.closed_at", c.period)}))::float8 AS avg_cycle
    FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id
    WHERE ${dealWhere(c)}
    GROUP BY d.owner_id`;
  const ids = rows.map((r) => r.owner_id).filter((x): x is string => !!x);
  const users = await prisma.user.findMany({ where: { id: { in: ids }, organizationId: actor.organizationId }, select: { id: true, name: true, disabledAt: true } });
  const nameOf = new Map(users.map((u) => [u.id, u]));
  const items = rows
    .filter((r) => r.open_count + r.won_count + r.lost_count > 0)
    .map((r) => ({
      ownerId: r.owner_id,
      name: r.owner_id ? nameOf.get(r.owner_id)?.name ?? "Usuario eliminado" : "Sin responsable",
      active: r.owner_id ? !nameOf.get(r.owner_id)?.disabledAt : true,
      open: { count: r.open_count, amount: money(r.open_amount), weighted: money(r.weighted) },
      won: { count: r.won_count, amount: money(r.won_amount) },
      lost: { count: r.lost_count, amount: money(r.lost_amount) },
      winRate: winRate(r.won_count, r.lost_count),
      cycleDays: r.avg_cycle === null ? null : Math.round((r.avg_cycle / 86_400) * 10) / 10,
    }))
    .sort((a, b) => b.won.amount - a.won.amount || b.open.amount - a.open.amount);
  return { currency: c.currency, period: periodOut(c.period), items };
}

// ── Por origen y anuncio (cohorte de negocios creados en el periodo) ────────

export async function getOriginsReport(actor: CrmActor, raw: unknown) {
  const c = await loadCtx(actor, raw);
  const base = Prisma.sql`
    COUNT(*)::int AS created,
    COUNT(*) FILTER (WHERE d.status = 'WON')::int AS won,
    COUNT(*) FILTER (WHERE d.status = 'LOST')::int AS lost,
    COUNT(*) FILTER (WHERE d.status = 'OPEN')::int AS open,
    COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'WON'), 0)::float8 AS won_amount,
    COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'OPEN'), 0)::float8 AS open_amount`;
  type Row = { created: number; won: number; lost: number; open: number; won_amount: number; open_amount: number };
  const [origins, ads] = await Promise.all([
    prisma.$queryRaw<Array<Row & { lead_origin: string }>>`
      SELECT d.lead_origin::text AS lead_origin, ${base} FROM deals d
      WHERE ${dealWhere(c)} AND ${inPeriod("d.created_at", c.period)} GROUP BY d.lead_origin ORDER BY created DESC`,
    prisma.$queryRaw<Array<Row & { ad_id: string }>>`
      SELECT d.ad_id, ${base} FROM deals d
      WHERE ${dealWhere(c)} AND d.ad_id IS NOT NULL AND ${inPeriod("d.created_at", c.period)} GROUP BY d.ad_id ORDER BY created DESC, d.ad_id LIMIT 50`,
  ]);
  const shape = (r: Row) => ({
    created: r.created,
    open: { count: r.open, amount: money(r.open_amount) },
    won: { count: r.won, amount: money(r.won_amount) },
    lost: r.lost,
    winRate: winRate(r.won, r.lost),
    // De los negocios que llegaron por aquí, qué parte ya se ganó.
    conversion: rate(r.won, r.created),
  });
  return {
    currency: c.currency,
    period: periodOut(c.period),
    origins: origins.map((r) => ({ leadOrigin: r.lead_origin, ...shape(r) })),
    ads: ads.map((r) => ({ adId: r.ad_id, ...shape(r) })),
  };
}

// ── Motivos de pérdida ──────────────────────────────────────────────────────

export async function getLossReasonsReport(actor: CrmActor, raw: unknown) {
  const c = await loadCtx(actor, raw);
  const rows = await prisma.$queryRaw<Array<{ id: string | null; name: string | null; count: number; amount: number }>>`
    SELECT d.lost_reason_id AS id, lr.name, COUNT(*)::int AS count, COALESCE(SUM(d.amount), 0)::float8 AS amount
    FROM deals d LEFT JOIN loss_reasons lr ON lr.id = d.lost_reason_id
    WHERE ${dealWhere(c)} AND d.status = 'LOST' AND ${inPeriod("d.closed_at", c.period)}
    GROUP BY d.lost_reason_id, lr.name ORDER BY count DESC, lr.name`;
  const total = rows.reduce((n, r) => n + r.count, 0);
  return {
    currency: c.currency,
    period: periodOut(c.period),
    total,
    items: rows.map((r) => ({ reasonId: r.id, name: r.name ?? "Sin motivo", count: r.count, amount: money(r.amount), share: rate(r.count, total) })),
  };
}

// ── Tendencia ───────────────────────────────────────────────────────────────

export async function getTrend(actor: CrmActor, raw: unknown) {
  const c = await loadCtx(actor, raw);
  const g: Granularity = c.f.granularity ?? defaultGranularity(c.period);
  const unit = Prisma.raw(`'${g}'`);
  const step = Prisma.raw(`interval '1 ${g}'`);
  const local = (col: string) => Prisma.sql`date_trunc(${unit}, (${Prisma.raw(col)} AT TIME ZONE 'UTC') AT TIME ZONE ${c.tz})`;
  const fromLocal = Prisma.sql`(${c.period.from.toISOString()}::timestamptz AT TIME ZONE ${c.tz})`;
  const toLocal = Prisma.sql`(${c.period.to.toISOString()}::timestamptz AT TIME ZONE ${c.tz})`;
  const rows = await prisma.$queryRaw<Array<{ bucket: string; created: number; created_amount: number; won: number; won_amount: number; lost: number }>>`
    WITH b AS (SELECT generate_series(date_trunc(${unit}, ${fromLocal}), ${toLocal} - interval '1 millisecond', ${step}) AS bucket),
    cr AS (SELECT ${local("d.created_at")} AS bucket, COUNT(*)::int AS n, SUM(d.amount) AS amt FROM deals d
           WHERE ${dealWhere(c)} AND ${inPeriod("d.created_at", c.period)} GROUP BY 1),
    wn AS (SELECT ${local("d.closed_at")} AS bucket, COUNT(*)::int AS n, SUM(d.amount) AS amt FROM deals d
           WHERE ${dealWhere(c)} AND d.status = 'WON' AND ${inPeriod("d.closed_at", c.period)} GROUP BY 1),
    ls AS (SELECT ${local("d.closed_at")} AS bucket, COUNT(*)::int AS n FROM deals d
           WHERE ${dealWhere(c)} AND d.status = 'LOST' AND ${inPeriod("d.closed_at", c.period)} GROUP BY 1)
    SELECT to_char(b.bucket, 'YYYY-MM-DD') AS bucket,
           COALESCE(cr.n, 0)::int AS created, COALESCE(cr.amt, 0)::float8 AS created_amount,
           COALESCE(wn.n, 0)::int AS won, COALESCE(wn.amt, 0)::float8 AS won_amount,
           COALESCE(ls.n, 0)::int AS lost
    FROM b LEFT JOIN cr ON cr.bucket = b.bucket LEFT JOIN wn ON wn.bucket = b.bucket LEFT JOIN ls ON ls.bucket = b.bucket
    ORDER BY b.bucket`;
  return {
    currency: c.currency,
    period: periodOut(c.period),
    granularity: g,
    items: rows.map((r) => ({ bucket: r.bucket, created: r.created, createdAmount: money(r.created_amount), won: r.won, wonAmount: money(r.won_amount), lost: r.lost })),
  };
}

// ── Pronóstico ──────────────────────────────────────────────────────────────

export async function getForecast(actor: CrmActor, raw: unknown) {
  const c = await loadCtx(actor, raw);
  const [byDate, byStage, wonThisMonth] = await Promise.all([
    prisma.$queryRaw<Array<{ expected: Date | null; count: number; amount: number; weighted: number }>>`
      SELECT d.expected_close_date::date AS expected, COUNT(*)::int AS count, COALESCE(SUM(d.amount), 0)::float8 AS amount, COALESCE(SUM(${WEIGHTED}), 0)::float8 AS weighted
      FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id WHERE ${dealWhere(c)} AND d.status = 'OPEN' GROUP BY 1`,
    prisma.$queryRaw<Array<{ stage_id: string; name: string; position: number; probability: number; count: number; amount: number; weighted: number }>>`
      SELECT s.id AS stage_id, s.name, s.position, s.probability, COUNT(*)::int AS count, COALESCE(SUM(d.amount), 0)::float8 AS amount, COALESCE(SUM(${WEIGHTED}), 0)::float8 AS weighted
      FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id WHERE ${dealWhere(c)} AND d.status = 'OPEN' GROUP BY s.id, s.name, s.position, s.probability ORDER BY s.position`,
    // Ganado en lo que va del mes (en la zona de la organización).
    (async () => {
      const monthStart = localMonthStart(c.now, c.tz);
      const [r] = await prisma.$queryRaw<Array<{ count: number; amount: number }>>`
        SELECT COUNT(*)::int AS count, COALESCE(SUM(d.amount), 0)::float8 AS amount FROM deals d
        WHERE ${dealWhere(c)} AND d.status = 'WON' AND d.closed_at >= ${ts(monthStart)}`;
      return r;
    })(),
  ]);

  const buckets = new Map<string, { count: number; amount: number; weighted: number }>();
  for (const r of byDate) {
    const key = forecastBucket(r.expected, c.now);
    const b = buckets.get(key) ?? { count: 0, amount: 0, weighted: 0 };
    b.count += r.count;
    b.amount += r.amount;
    b.weighted += r.weighted;
    buckets.set(key, b);
  }
  const order = (k: string) => (k === "overdue" ? "0" : k === "none" ? "9" : "1" + k);
  const periods = [...buckets.entries()]
    .sort(([a], [b]) => order(a).localeCompare(order(b)))
    .map(([period, v]) => ({ period, count: v.count, amount: money(v.amount), weighted: money(v.weighted) }));
  const totals = periods.reduce((t, p) => ({ count: t.count + p.count, amount: t.amount + p.amount, weighted: t.weighted + p.weighted }), { count: 0, amount: 0, weighted: 0 });

  const thisMonthKey = localMonthKey(c.now, c.tz);
  const expectedThisMonth = buckets.get(thisMonthKey)?.weighted ?? 0;
  return {
    currency: c.currency,
    asOf: c.now.toISOString(),
    open: { count: totals.count, amount: money(totals.amount), weighted: money(totals.weighted) },
    periods,
    stages: byStage.map((s) => ({ stageId: s.stage_id, name: s.name, probability: s.probability, count: s.count, amount: money(s.amount), weighted: money(s.weighted) })),
    // Cierre del mes en curso: lo ya ganado + lo ponderado que se espera cerrar este mes.
    thisMonth: {
      month: thisMonthKey,
      wonSoFar: { count: wonThisMonth.count, amount: money(wonThisMonth.amount) },
      expectedWeighted: money(expectedThisMonth),
      projected: money(wonThisMonth.amount + expectedThisMonth),
    },
  };
}

function localMonthKey(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

function localMonthStart(now: Date, tz: string): Date {
  return localDayStart(`${localMonthKey(now, tz)}-01`, tz)!;
}

// Despacho por nombre para la ruta `/api/crm/reports/[report]`.
const REPORT_FNS = {
  summary: getSummary,
  funnel: getFunnel,
  owners: getOwnersReport,
  origins: getOriginsReport,
  "loss-reasons": getLossReasonsReport,
  trend: getTrend,
  forecast: getForecast,
} as const;
export type ReportName = keyof typeof REPORT_FNS;
export const REPORTS: Record<ReportName, (actor: CrmActor, raw: unknown) => Promise<unknown>> = REPORT_FNS;

export function isReportName(name: string): name is ReportName {
  return Object.prototype.hasOwnProperty.call(REPORTS, name);
}

