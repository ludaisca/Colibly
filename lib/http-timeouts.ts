// Timeouts de TODA llamada HTTP saliente (Meta Graph API, Telegram, OpenCode,
// Google). Sin ellos, una llamada colgada retenía el job de BullMQ varios
// minutos (el timeout por defecto de undici) — y las colas con concurrencia 1
// (campañas, ticks de recuperación/calificación/secuencias/recordatorios) se
// quedaban bloqueadas completas mientras tanto. Ojo: la opción `timeout` de los
// jobs de BullMQ no existe en la v5, no sustituye a esto.

// Llamadas JSON (enviar mensaje, consultar metadatos, validar tokens).
export const HTTP_TIMEOUT_MS = 20_000;
// Subir o descargar archivos (media de hasta decenas de MB).
export const HTTP_TRANSFER_TIMEOUT_MS = 120_000;
// Una llamada de completion de IA puede tardar legítimamente bastante más.
export const AI_REQUEST_TIMEOUT_MS = 90_000;

// Señal nueva por llamada — no reutilizar entre reintentos: el reloj corre
// desde que se crea.
export function httpTimeout(ms: number = HTTP_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}
