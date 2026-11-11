// Reglas puras de Estadísticas (sin base de datos): fechas del gráfico en la
// zona del negocio, fusión de agregados por agente y tope de tiempo.

/** "AAAA-MM-DD" del instante `date` visto en `timeZone`. */
export function dateKeyInTz(date: Date, timeZone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone });
}

/**
 * Las `days` fechas del gráfico (la más vieja primero), contadas en el
 * calendario de `timeZone`, igual que se agrupan los mensajes en la base. El
 * servidor corre en UTC: sin esto, en la tarde de México el último día del
 * gráfico sería "mañana".
 */
export function chartDayKeys(now: Date, timeZone: string, days = 14): string[] {
  const [y, m, d] = dateKeyInTz(now, timeZone).split("-").map(Number);
  return Array.from({ length: days }, (_, i) => new Date(Date.UTC(y, m - 1, d - (days - 1) + i)).toISOString().slice(0, 10));
}

export interface AgentAggregateRow {
  userId: string;
  resolved: number;
  responseSum: number;
  responseCount: number;
  resolutionSum: number;
  resolutionCount: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Suma las filas de WhatsApp y de canales por agente y saca los promedios. */
export function mergeAgentRows(rows: AgentAggregateRow[]) {
  const byUser = new Map<string, AgentAggregateRow>();
  for (const r of rows) {
    const e = byUser.get(r.userId) ?? { userId: r.userId, resolved: 0, responseSum: 0, responseCount: 0, resolutionSum: 0, resolutionCount: 0 };
    e.resolved += Number(r.resolved);
    e.responseSum += Number(r.responseSum);
    e.responseCount += Number(r.responseCount);
    e.resolutionSum += Number(r.resolutionSum);
    e.resolutionCount += Number(r.resolutionCount);
    byUser.set(r.userId, e);
  }
  return [...byUser.values()]
    .map((e) => ({
      userId: e.userId,
      resolvedCount: e.resolved,
      avgFirstResponseMinutes: e.responseCount ? round1(e.responseSum / e.responseCount) : null,
      avgResolutionMinutes: e.resolutionCount ? round1(e.resolutionSum / e.resolutionCount) : null,
    }))
    .sort((a, b) => b.resolvedCount - a.resolvedCount);
}

export class StatsTimeoutError extends Error {
  constructor(ms: number) {
    super(`Las estadísticas tardaron más de ${Math.round(ms / 1000)} s`);
  }
}

/** Corta una promesa que tarda demasiado: mejor un error con reintento que una pantalla de carga eterna. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new StatsTimeoutError(ms)), ms);
    }),
  ]);
}
