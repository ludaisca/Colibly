// Fechas en la zona horaria de la organización, sin librerías y sin offsets
// fijos. Los reportes usaban "T00:00:00-06:00", que solo vale para el centro
// de México: Tijuana (con horario de verano), Cancún o una organización fuera
// del país cortaban los días en la hora equivocada.
//
// Todo es puro (Intl + aritmética UTC) para poder probarlo sin base de datos.

const DTF_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = DTF_CACHE.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    DTF_CACHE.set(timeZone, dtf);
  }
  return dtf;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = domingo … 6 = sábado (misma convención que Date#getDay). */
  dow: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    dow: WEEKDAYS[parts.weekday] ?? 0,
  };
}

/** Minutos que la zona va adelante de UTC en ese instante (México centro: -360). */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** "YYYY-MM-DD" del día local en la zona. */
export function zonedDayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Instante UTC en que empieza el día `key` (00:00 local). Se corrige una vez
 * con el offset del propio resultado para que funcione en los días de cambio
 * de horario.
 */
export function zonedDayStart(key: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return new Date(NaN);
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  let result = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  const corrected = guess - zoneOffsetMinutes(new Date(result), timeZone) * 60000;
  if (corrected !== result) result = corrected;
  return new Date(result);
}

/** Suma días a una clave "YYYY-MM-DD" (calendario puro, sin zona). */
export function addDaysKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Hora (0–23) y día de la semana (0 = domingo) locales. */
export function zonedHourAndDow(date: Date, timeZone: string): { hour: number; dow: number } {
  const { hour, dow } = zonedParts(date, timeZone);
  return { hour, dow };
}

/** Zona IANA válida para Intl; si no, la de respaldo. */
export function safeTimeZone(timeZone: string | null | undefined, fallback = "America/Mexico_City"): string {
  if (!timeZone) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return fallback;
  }
}
