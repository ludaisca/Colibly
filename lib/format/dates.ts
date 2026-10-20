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
