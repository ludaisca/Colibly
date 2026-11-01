import { safeTimeZone, zonedHourAndDow } from "./zoned";

// Dentro del horario del negocio: hora local en [startHour, endHour) y, si se
// pasan `days`, día de la semana local entre los hábiles (0 = domingo). Sin
// `days` todos los días cuentan — el comportamiento previo a businessDays.
export function isWithinBusinessHours(
  now: Date,
  { timezone, startHour, endHour, days }: { timezone: string; startHour: number; endHour: number; days?: number[] }
): boolean {
  const { hour, dow } = zonedHourAndDow(now, safeTimeZone(timezone));
  if (days && days.length > 0 && !days.includes(dow)) return false;
  return hour >= startHour && hour < endHour;
}
