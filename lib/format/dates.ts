// Fechas para personas, siempre con zona horaria explícita. El contenedor
// corre en UTC y el navegador en la hora local: sin `timeZone`, una fecha que
// el servidor pinta (RSC, SSR de un componente cliente, notificaciones de los
// workers) sale en UTC — un día antes o después cerca de la medianoche, la
// hora corrida 6 h — y en SSR provoca un error de hidratación. Donde se
// conoce la zona de la organización (`Organization.timezone`), se pasa; si
// no, la de México. Módulo sin dependencias de servidor: lo usan también los
// componentes cliente.

export const DEFAULT_TIME_ZONE = "America/Mexico_City";

export function formatInZone(
  value: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  timeZone: string = DEFAULT_TIME_ZONE
): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-MX", { ...options, timeZone });
}

/**
 * "hace 5 min", "hace 3 h", "hace 2 días", "ayer"… Puro: recibe `now` para
 * poder probarlo y para que el servidor y el cliente usen el mismo instante.
 * Fechas futuras: "en 5 min", "en 2 días".
 */
export function formatRelative(value: Date | string, now: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = now.getTime() - date.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.floor(abs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const wrap = (text: string) => (future ? `en ${text}` : `hace ${text}`);
  if (minutes < 1) return future ? "en un momento" : "ahora";
  if (minutes < 60) return wrap(`${minutes} min`);
  if (hours < 24) return wrap(`${hours} h`);
  if (days === 1) return future ? "mañana" : "ayer";
  if (days < 30) return wrap(`${days} días`);
  const months = Math.floor(days / 30);
  if (months < 12) return wrap(months === 1 ? "1 mes" : `${months} meses`);
  const years = Math.floor(days / 365);
  return wrap(years === 1 ? "1 año" : `${years} años`);
}

/** Minutos completos transcurridos (0 si es futuro o inválido). */
export function minutesSince(value: Date | string | null | undefined, now: Date = new Date()): number {
  if (!value) return 0;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
}
