import { safeTimeZone, zonedParts } from "@/lib/dates/zoned";

// SLA de la bandeja: reglas puras (sin base), probadas en __tests__/rules.test.ts.
//
// Dos relojes por chat abierto:
//  - respuesta: desde que el cliente espera (waitingSince) hasta que alguien
//    (persona, bot o flujo) le contesta. Cuenta cada espera, no solo la
//    primera: "ningún cliente espera más de N minutos".
//  - resolución: desde que empezó el ciclo abierto actual (openedAt, o
//    createdAt si nunca se reabrió) hasta que se resuelve.
// Ninguno cuenta tiempo anterior a slaEnabledAt (encender el SLA no hace
// vencer de golpe los chats viejos). Un chat pospuesto (snoozedUntil en el
// futuro) o PENDING (esperando al cliente) no vence. Con horario laboral, los
// relojes solo corren dentro del horario del negocio.

export interface SlaConfig {
  enabledAt: Date | null;
  responseMinutes: number;
  resolutionHours: number;
  businessHoursOnly: boolean;
}

export interface BusinessHours {
  timezone: string;
  startHour: number;
  endHour: number;
  /** 0 = domingo … 6 = sábado. Vacío = todos los días. */
  days: number[];
}

export const SLA_RESPONSE_MINUTES_RANGE = { min: 5, max: 1440 } as const;
export const SLA_RESOLUTION_HOURS_RANGE = { min: 1, max: 720 } as const;

const MINUTE = 60_000;

/**
 * El instante en que se cumplen `minutes` minutos contados desde `start`. Con
 * horario, solo cuentan los minutos dentro de él (por bloques de una hora
 * local, así que funciona con zonas de media hora). Sin horario válido
 * (inicio ≥ fin o ningún día), cuenta corrido para no quedar en un bucle.
 */
export function addBusinessMinutes(start: Date, minutes: number, hours: BusinessHours | null): Date {
  if (minutes <= 0) return start;
  const valid = hours && hours.startHour < hours.endHour && hours.startHour >= 0 && hours.endHour <= 24;
  if (!hours || !valid) return new Date(start.getTime() + minutes * MINUTE);
  const tz = safeTimeZone(hours.timezone);
  const days = hours.days.length > 0 ? hours.days : [0, 1, 2, 3, 4, 5, 6];

  let t = start.getTime();
  let remaining = minutes * MINUTE;
  // Tope de seguridad: 60 semanas de bloques de una hora.
  for (let i = 0; i < 24 * 7 * 60 && remaining > 0; i++) {
    const p = zonedParts(new Date(t), tz);
    const toBoundary = ((60 - p.minute) * 60 - p.second) * 1000 - (t % 1000);
    const inHours = days.includes(p.dow) && p.hour >= hours.startHour && p.hour < hours.endHour;
    if (inHours) {
      const take = Math.min(remaining, toBoundary);
      remaining -= take;
      t += take;
    } else {
      t += toBoundary;
    }
  }
  return new Date(t);
}

export interface SlaChat {
  status: string;
  snoozedUntil: Date | null;
  waitingSince: Date | null;
  openedAt: Date | null;
  createdAt: Date;
}

export interface SlaClock {
  /** Inicio del reloj ya recortado a slaEnabledAt: también es la clave del aviso. */
  startedAt: Date;
  dueAt: Date;
  breached: boolean;
}

export interface SlaState {
  response: SlaClock | null;
  resolution: SlaClock | null;
}

const later = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);

/** Relojes vigentes de un chat (null = ese reloj no corre ahora). */
export function slaState(chat: SlaChat, config: SlaConfig, hours: BusinessHours | null, now: Date): SlaState {
  if (!config.enabledAt || chat.status !== "OPEN") return { response: null, resolution: null };
  if (chat.snoozedUntil && chat.snoozedUntil.getTime() > now.getTime()) return { response: null, resolution: null };
  const bh = config.businessHoursOnly ? hours : null;

  let response: SlaClock | null = null;
  if (chat.waitingSince) {
    const startedAt = later(chat.waitingSince, config.enabledAt);
    const dueAt = addBusinessMinutes(startedAt, config.responseMinutes, bh);
    response = { startedAt, dueAt, breached: now.getTime() >= dueAt.getTime() };
  }
  const startedAt = later(chat.openedAt ?? chat.createdAt, config.enabledAt);
  const dueAt = addBusinessMinutes(startedAt, config.resolutionHours * 60, bh);
  const resolution: SlaClock = { startedAt, dueAt, breached: now.getTime() >= dueAt.getTime() };
  return { response, resolution };
}

/**
 * Lo más antiguo que podría estar vencido (corte para la consulta del tick):
 * con horario un reloj tarda al menos lo mismo que sin él, así que todo chat
 * vencido empezó antes de now − objetivo.
 */
export function slaCandidateCutoffs(config: SlaConfig, now: Date): { response: Date; resolution: Date } {
  return {
    response: new Date(now.getTime() - config.responseMinutes * MINUTE),
    resolution: new Date(now.getTime() - config.resolutionHours * 60 * MINUTE),
  };
}

/** Lo que muestra la bandeja: vencido solo si el aviso corresponde al reloj actual. */
export function slaBreachFlags(chat: SlaChat & { slaResponseBreachedFor: Date | null; slaResolutionBreachedFor: Date | null }): {
  responseBreached: boolean;
  resolutionBreached: boolean;
} {
  const open = chat.status === "OPEN";
  const r = chat.slaResponseBreachedFor;
  const z = chat.slaResolutionBreachedFor;
  return {
    responseBreached: open && !!r && !!chat.waitingSince && r.getTime() >= chat.waitingSince.getTime(),
    resolutionBreached: open && !!z && z.getTime() >= (chat.openedAt ?? chat.createdAt).getTime(),
  };
}

/** "45 min", "3 h", "1 h 30 min". */
export function formatSlaMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
