// Cuándo toca un respaldo programado. Funciones puras (con tests): el tick de
// BullMQ solo pregunta "¿toca?" con el historial reciente.

export const BACKUP_MAX_ATTEMPTS_PER_SLOT = 3;
export const BACKUP_RETRY_DELAY_MS = 60 * 60 * 1000;
// Un respaldo "en curso" por más tiempo que esto se da por interrumpido (el
// contenedor se reinició a medias): sin esto bloquearía todos los siguientes.
export const BACKUP_STALE_RUNNING_MS = 3 * 60 * 60 * 1000;

export interface BackupRunLite {
  trigger: "SCHEDULED" | "MANUAL";
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: Date;
}

// Desfase (ms) de la zona respecto a UTC en un instante: local = utc + offset.
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

// Instante en que la hora local de `timeZone` es `hour`:00 del día local de `day`.
function localHourInstant(day: { y: number; m: number; d: number }, hour: number, timeZone: string): Date {
  const guess = Date.UTC(day.y, day.m - 1, day.d, hour, 0, 0);
  // Dos pasadas: el desfase puede cambiar entre la estimación y el instante real (horario de verano).
  let instant = guess - zoneOffsetMs(new Date(guess), timeZone);
  instant = guess - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

// El último horario programado que ya pasó: hoy a la hora configurada, o ayer si todavía no llega.
export function currentBackupSlot(now: Date, hour: number, timeZone: string): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now, timeZone));
  const today = { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
  const todaySlot = localHourInstant(today, hour, timeZone);
  if (todaySlot.getTime() <= now.getTime()) return todaySlot;
  const yesterday = new Date(Date.UTC(today.y, today.m - 1, today.d - 1));
  return localHourInstant({ y: yesterday.getUTCFullYear(), m: yesterday.getUTCMonth() + 1, d: yesterday.getUTCDate() }, hour, timeZone);
}

export type BackupDecision =
  | { due: true; slot: Date; attempt: number }
  | { due: false; slot: Date; reason: "done" | "running" | "retry_wait" | "gave_up" };

// Solo cuentan los respaldos PROGRAMADOS: uno manual no sustituye al de la noche.
// Activar la función a las 2 pm con hora 3 → el horario vigente es el de hoy 3:00 y
// aún no hay corrida, así que el primer respaldo sale de inmediato.
export function decideBackup(opts: { now: Date; hour: number; timeZone: string; runs: BackupRunLite[] }): BackupDecision {
  const slot = currentBackupSlot(opts.now, opts.hour, opts.timeZone);
  const inSlot = opts.runs.filter((r) => r.trigger === "SCHEDULED" && r.startedAt.getTime() >= slot.getTime());

  if (inSlot.some((r) => r.status === "SUCCESS")) return { due: false, slot, reason: "done" };
  if (inSlot.some((r) => r.status === "RUNNING")) return { due: false, slot, reason: "running" };

  const failures = inSlot.filter((r) => r.status === "FAILED");
  if (failures.length >= BACKUP_MAX_ATTEMPTS_PER_SLOT) return { due: false, slot, reason: "gave_up" };
  if (failures.length > 0) {
    const last = Math.max(...failures.map((r) => r.startedAt.getTime()));
    if (opts.now.getTime() - last < BACKUP_RETRY_DELAY_MS) return { due: false, slot, reason: "retry_wait" };
  }
  return { due: true, slot, attempt: failures.length + 1 };
}

// ¿Este respaldo en curso ya se considera abandonado?
export function isStaleRun(startedAt: Date, now: Date): boolean {
  return now.getTime() - startedAt.getTime() > BACKUP_STALE_RUNNING_MS;
}
