import { summarizeResponses } from "./response-rules";

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
  resolutionSum: number;
  resolutionCount: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Por agente: resueltos y resolución promedio (filas de WhatsApp y de canales
 * sumadas) más su primera respuesta (mediana y promedio de las conversaciones
 * que esa persona respondió primero, ver response-rules.ts). Entra también
 * quien respondió sin tener chats asignados.
 */
export function mergeAgentRows(rows: AgentAggregateRow[], responseMinutesByUser: Map<string, number[]> = new Map()) {
  const byUser = new Map<string, AgentAggregateRow>();
  const ensure = (userId: string) => {
    const e = byUser.get(userId) ?? { userId, resolved: 0, resolutionSum: 0, resolutionCount: 0 };
    byUser.set(userId, e);
    return e;
  };
  for (const r of rows) {
    const e = ensure(r.userId);
    e.resolved += Number(r.resolved);
    e.resolutionSum += Number(r.resolutionSum);
    e.resolutionCount += Number(r.resolutionCount);
  }
  for (const userId of responseMinutesByUser.keys()) ensure(userId);
  return [...byUser.values()]
    .map((e) => {
      const response = summarizeResponses(responseMinutesByUser.get(e.userId) ?? []);
      return {
        userId: e.userId,
        resolvedCount: e.resolved,
        medianFirstResponseMinutes: response.medianMinutes,
        avgFirstResponseMinutes: response.avgMinutes,
        respondedCount: response.count,
        avgResolutionMinutes: e.resolutionCount ? round1(e.resolutionSum / e.resolutionCount) : null,
      };
    })
    .sort((a, b) => b.resolvedCount - a.resolvedCount || b.respondedCount - a.respondedCount);
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
