// Lógica pura del calendario (portada de `tsl-calendar`, Tesela, 2026-11-07).
// Fechas "de calendario" en ISO `AAAA-MM-DD`, sin hora ni zona: se crean y
// comparan en hora local, así el día elegido es el mismo en servidor y
// navegador. Lo usan ui/calendar.tsx, ui/date-picker.tsx y
// ui/date-range-picker.tsx; se prueba sin DOM.

export interface IsoRange {
  start: string;
  end: string;
}

/** `AAAA-MM-DD` → Date local a medianoche, o null si no es una fecha real. */
export function fromISO(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toISO(d) === iso ? d : null;
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Primer día del mes de `d`. */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

/** Las 42 fechas (6 semanas) que pinta un mes, empezando en `weekStart` (1 = lunes). */
export function monthGrid(view: Date, weekStart = 1): Date[] {
  const y = view.getFullYear();
  const m = view.getMonth();
  const offset = (new Date(y, m, 1).getDay() - weekStart + 7) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(y, m, 1 - offset + i));
}

export function isOutOfBounds(iso: string, min?: string, max?: string): boolean {
  return Boolean((min && iso < min) || (max && iso > max));
}

/**
 * Nueva fecha enfocada al pulsar una tecla de navegación, o null si la tecla
 * no mueve el foco. Flechas: día y semana; Re Pág / Av Pág: mes; con Mayús,
 * año. Al cambiar de mes se conserva el día, recortado al último del mes.
 */
export function moveByKey(d: Date, key: string, shift = false): Date | null {
  const next = new Date(d);
  const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (key in steps) {
    next.setDate(next.getDate() + steps[key]);
    return next;
  }
  if (key === "Home" || key === "End") {
    // Inicio / fin de la semana visible (lunes a domingo).
    const dow = (next.getDay() + 6) % 7;
    next.setDate(next.getDate() + (key === "Home" ? -dow : 6 - dow));
    return next;
  }
  if (key === "PageUp" || key === "PageDown") {
    const dir = key === "PageUp" ? -1 : 1;
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + (shift ? 12 * dir : dir));
    next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    return next;
  }
  return null;
}

/**
 * Elegir un día en modo rango: el primer clic abre el rango, el segundo lo
 * cierra; un día anterior al inicio lo reemplaza; con el rango completo,
 * un clic empieza otro.
 */
export function pickInRange(current: { start: string | null; end: string | null }, iso: string): { start: string; end: string | null } {
  if (!current.start || current.end) return { start: iso, end: null };
  if (iso < current.start) return { start: iso, end: null };
  return { start: current.start, end: iso };
}

/** "14 oct 2026" (es-MX, estilo medio). Vacío si no es una fecha. */
export function formatCalendarDate(iso: string, locale = "es-MX"): string {
  const d = fromISO(iso);
  return d ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d) : "";
}
