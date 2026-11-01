// Reglas puras del auto-resolver (sin Prisma), para probarlas sin base.

export const AUTO_RESOLVE_MIN_HOURS = 1;
export const AUTO_RESOLVE_MAX_HOURS = 720; // 30 días
/** Tope de chats resueltos por organización en cada tick (cada 15 min). */
export const AUTO_RESOLVE_BATCH = 200;

export interface AutoResolveConfig {
  afterHours: number | null;
  skipWaiting: boolean;
}

/** null si está apagado o fuera de rango (un valor raro en la base no resuelve nada). */
export function autoResolveCutoff(config: AutoResolveConfig, now: Date): Date | null {
  const hours = config.afterHours;
  if (hours === null || !Number.isInteger(hours)) return null;
  if (hours < AUTO_RESOLVE_MIN_HOURS || hours > AUTO_RESOLVE_MAX_HOURS) return null;
  return new Date(now.getTime() - hours * 3_600_000);
}

export interface AutoResolveCandidate {
  status: "OPEN" | "PENDING" | "RESOLVED";
  lastMessageAt: Date | null;
  snoozedUntil: Date | null;
  waitingSince: Date | null;
}

/**
 * ¿Este chat se resuelve? Misma regla que el `where` del runner; existe para
 * probar los bordes (posposición vigente, cliente esperando, sin mensajes).
 */
export function shouldAutoResolve(chat: AutoResolveCandidate, config: AutoResolveConfig, now: Date): boolean {
  const cutoff = autoResolveCutoff(config, now);
  if (!cutoff) return false;
  if (chat.status === "RESOLVED") return false;
  if (!chat.lastMessageAt || chat.lastMessageAt >= cutoff) return false;
  if (chat.snoozedUntil && chat.snoozedUntil > now) return false;
  if (config.skipWaiting && chat.waitingSince) return false;
  return true;
}
