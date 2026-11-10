import { timeZoneLabel } from "./time-zone";

// Resumen del horario del negocio para la tarjeta de Configuración:
// "Lun–Sáb, 9:00–19:00, Ciudad de México". El horario es un solo rango para
// todos los días (Organization.businessHourStart/End + businessDays).

// Lunes primero; el valor es el de Date#getDay.
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const LABEL: Record<number, string> = { 0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb" };

export function businessDaysLabel(days: number[]): string {
  const set = new Set(days);
  if (set.size === 0) return "Sin días hábiles";
  if (set.size === 7) return "Todos los días";
  const runs: number[][] = [];
  for (const d of ORDER) {
    if (!set.has(d)) continue;
    const last = runs[runs.length - 1];
    if (last && ORDER.indexOf(last[last.length - 1]) === ORDER.indexOf(d) - 1) last.push(d);
    else runs.push([d]);
  }
  return runs
    .map((run) => (run.length >= 3 ? `${LABEL[run[0]]}–${LABEL[run[run.length - 1]]}` : run.map((d) => LABEL[d]).join(", ")))
    .join(", ");
}

export function businessHoursSummary(input: { timezone: string; businessHourStart: number; businessHourEnd: number; businessDays: number[] }): string {
  return `${businessDaysLabel(input.businessDays)}, ${input.businessHourStart}:00–${input.businessHourEnd}:00, ${timeZoneLabel(input.timezone)}`;
}
