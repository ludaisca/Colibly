import { invalid } from "@/lib/crm/errors";
import { dayBounds, localDayStart, safeTimeZone } from "@/lib/crm/task-rules";

// Reglas PURAS de los reportes del CRM (sin base de datos, con pruebas):
// periodos, tasas y armado del embudo. Las consultas viven en `reports.ts`.

export const DEFAULT_PERIOD_DAYS = 90;
export const MAX_PERIOD_DAYS = 800;

export interface Period {
  from: Date; // inclusive
  to: Date; // exclusivo
}

// "YYYY-MM-DD" se interpreta en la zona de la organización (el `to` de fecha
// incluye ese día completo); un instante ISO se usa tal cual. Sin nada: los
// últimos 90 días contando hoy.
export function resolvePeriod(input: { from?: string; to?: string }, timeZone: string, now: Date): Period {
  const tz = safeTimeZone(timeZone);
  const parse = (v: string, isEnd: boolean): Date => {
    const day = localDayStart(v, tz);
    if (day) return isEnd ? dayBounds(new Date(day.getTime() + 12 * 3_600_000), tz).end : day;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) throw invalid(`Fecha inválida: ${v}`);
    const t = new Date(v);
    if (Number.isNaN(t.getTime())) throw invalid(`Fecha inválida: ${v}`);
    return t;
  };
  const to = input.to ? parse(input.to, true) : dayBounds(now, tz).end;
  const from = input.from ? parse(input.from, false) : dayBounds(new Date(to.getTime() - (DEFAULT_PERIOD_DAYS - 0.5) * 86_400_000), tz).start;
  if (from >= to) throw invalid("El periodo debe empezar antes de terminar");
  if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_PERIOD_DAYS) throw invalid(`El periodo no puede pasar de ${MAX_PERIOD_DAYS} días`);
  return { from, to };
}

// El periodo inmediato anterior, de la misma duración (para comparar).
export function previousPeriod(p: Period): Period {
  const len = p.to.getTime() - p.from.getTime();
  return { from: new Date(p.from.getTime() - len), to: p.from };
}

export type Granularity = "day" | "week" | "month";

// Granularidad razonable según el largo del periodo.
export function defaultGranularity(p: Period): Granularity {
  const days = (p.to.getTime() - p.from.getTime()) / 86_400_000;
  return days <= 45 ? "day" : days <= 200 ? "week" : "month";
}

// Cociente seguro: null cuando no hay base (en vez de 0 %, que mentiría).
export function rate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

// Tasa de cierre: ganados entre cerrados (ganados + perdidos).
export function winRate(won: number, lost: number): number | null {
  return rate(won, won + lost);
}

// ── Embudo ──────────────────────────────────────────────────────────────────

export interface FunnelStage {
  id: string;
  name: string;
  position: number;
}

// Por cada negocio de la cohorte: la posición más avanzada de una etapa
// ABIERTA que alguna vez ocupó y si alguna vez se ganó. `count` agrupa negocios
// iguales (la consulta ya los agrega).
export interface VisitGroup {
  maxOpenPosition: number | null;
  everWon: boolean;
  count: number;
}

export interface FunnelRow {
  stageId: string | null; // null = Ganado
  name: string;
  reached: number;
  // % de los que llegaron a la etapa anterior que llegaron a esta.
  fromPrevious: number | null;
  // % de toda la cohorte que llegó aquí.
  fromStart: number | null;
}

// "Llegó a la etapa k" = ocupó k o una posterior (un salto de etapa cuenta
// como haber pasado por las intermedias) o se ganó. Un negocio ganado cuenta en
// todas las etapas abiertas y en "Ganado".
export function buildFunnel(openStages: FunnelStage[], groups: VisitGroup[]): { total: number; rows: FunnelRow[] } {
  const stages = [...openStages].sort((a, b) => a.position - b.position);
  const total = groups.reduce((n, g) => n + g.count, 0);
  const reachedOf = (pos: number) =>
    groups.reduce((n, g) => n + (g.everWon || (g.maxOpenPosition !== null && g.maxOpenPosition >= pos) ? g.count : 0), 0);

  const rows: FunnelRow[] = stages.map((s) => ({ stageId: s.id, name: s.name, reached: reachedOf(s.position), fromPrevious: null, fromStart: rate(reachedOf(s.position), total) }));
  const won = groups.reduce((n, g) => n + (g.everWon ? g.count : 0), 0);
  rows.push({ stageId: null, name: "Ganado", reached: won, fromPrevious: null, fromStart: rate(won, total) });
  for (let i = 1; i < rows.length; i++) rows[i].fromPrevious = rate(rows[i].reached, rows[i - 1].reached);
  return { total, rows };
}

// ── Pronóstico ──────────────────────────────────────────────────────────────

// Clave del mes de un cierre esperado ("2026-10"), o "overdue" si ya pasó y el
// negocio sigue abierto, o "none" si no tiene fecha. `now` en UTC basta: la fecha
// de cierre se guarda al mediodía UTC del día elegido.
export function forecastBucket(expected: Date | null, now: Date): string {
  if (!expected) return "none";
  const day = new Date(Date.UTC(expected.getUTCFullYear(), expected.getUTCMonth(), expected.getUTCDate()));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (day < today) return "overdue";
  return `${expected.getUTCFullYear()}-${String(expected.getUTCMonth() + 1).padStart(2, "0")}`;
}
