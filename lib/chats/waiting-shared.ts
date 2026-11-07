// Parte pura de lib/chats/waiting.ts, sin Prisma: la importan los
// componentes cliente (waiting-badge.tsx). Mismo patrón que media-shared.ts.

/** Umbrales del indicador en la lista (minutos de espera). */
export const WAITING_WARN_MINUTES = 15;
export const WAITING_DANGER_MINUTES = 60;

export type WaitingTone = "muted" | "warning" | "danger";

/** Tono del indicador según los minutos de espera (puro). */
export function waitingTone(minutes: number): WaitingTone {
  if (minutes >= WAITING_DANGER_MINUTES) return "danger";
  if (minutes >= WAITING_WARN_MINUTES) return "warning";
  return "muted";
}

/** Texto corto para la fila: "espera 5 min", "espera 3 h", "espera 2 d". */
export function waitingLabel(minutes: number): string {
  if (minutes < 1) return "espera ahora";
  if (minutes < 60) return `espera ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `espera ${hours} h`;
  return `espera ${Math.floor(hours / 24)} d`;
}

/**
 * Cifra del tablero de espera (Andén): "0:09", "1:12", "23:59" y, desde un
 * día, "2d". Puro; lo pinta WaitCells en celdas que voltean al cambiar.
 */
export function waitingClock(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m >= 24 * 60) return `${Math.floor(m / (24 * 60))}d`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** Lectura para lectores de pantalla: "Espera 1 h 12 min". */
export function waitingSpoken(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 1) return "Espera menos de un minuto";
  if (m >= 24 * 60) {
    const days = Math.floor(m / (24 * 60));
    return `Espera ${days} ${days === 1 ? "día" : "días"}`;
  }
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return `Espera ${h > 0 ? `${h} h ` : ""}${rest > 0 || h === 0 ? `${rest} min` : ""}`.trim();
}
