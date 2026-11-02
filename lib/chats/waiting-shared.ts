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
