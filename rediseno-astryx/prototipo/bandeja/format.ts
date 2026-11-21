// Formato de fechas con zona y locale FIJOS: servidor y navegador deben
// producir el mismo texto o React marca error de hidratación. En Colibly la
// zona vendrá de Organization.timezone.
export const TIME_ZONE = 'America/Mexico_City';

const timeFmt = new Intl.DateTimeFormat('es-MX', {timeStyle: 'short', timeZone: TIME_ZONE});
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {timeZone: TIME_ZONE}); // AAAA-MM-DD
const dayLongFmt = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: TIME_ZONE,
});
const shortDateFmt = new Intl.DateTimeFormat('es-MX', {day: 'numeric', month: 'short', timeZone: TIME_ZONE});

export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const dayKey = (iso: string | Date) => dayKeyFmt.format(new Date(iso));

/** "Hoy", "Ayer" o "lunes 18 de noviembre" para el separador de días. */
export function dayLabel(iso: string, now: Date): string {
  const key = dayKey(iso);
  if (key === dayKey(now)) return 'Hoy';
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return 'Ayer';
  const s = dayLongFmt.format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Hora si es de hoy, "Ayer", o fecha corta: lo que muestra la fila de la lista. */
export function listTime(iso: string, now: Date): string {
  const label = dayLabel(iso, now);
  if (label === 'Hoy') return formatTime(iso);
  if (label === 'Ayer') return 'Ayer';
  return shortDateFmt.format(new Date(iso));
}
