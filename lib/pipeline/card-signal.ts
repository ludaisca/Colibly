// Señal de una tarjeta del embudo (pura, probada): cuánto lleva sin moverse
// de etapa. Ámbar desde STALL_WARN_DAYS, rojo desde STALL_DANGER_DAYS; si no
// está detenida, el siguiente paso (cierre estimado) en gris.

export const STALL_WARN_DAYS = 3;
export const STALL_DANGER_DAYS = 6;
const DAY_MS = 86_400_000;

export interface CardSignalInput {
  closed?: boolean;
  stageEnteredAt?: string | null;
  expectedCloseAt: string | null;
}

export interface CardSignal {
  tone: "warning" | "danger" | "neutral";
  label: string;
}

export function stallDays(stageEnteredAt: string | null | undefined, now: number): number | null {
  if (!stageEnteredAt) return null;
  const at = Date.parse(stageEnteredAt);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((now - at) / DAY_MS));
}

/** `now` null (antes de hidratar): sin señal de tiempo, para no desajustar el HTML. */
export function stallSignal(card: CardSignalInput, now: number | null): CardSignal | null {
  if (now !== null && !card.closed) {
    const days = stallDays(card.stageEnteredAt, now);
    if (days !== null && days >= STALL_DANGER_DAYS) return { tone: "danger", label: `Sin movimiento ${days} d` };
    if (days !== null && days >= STALL_WARN_DAYS) return { tone: "warning", label: `Sin movimiento ${days} d` };
  }
  if (card.expectedCloseAt && !card.closed) {
    // La fecha se guarda como medianoche UTC del día elegido: se muestra en UTC.
    const date = new Date(card.expectedCloseAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
    return { tone: "neutral", label: `Cierre estimado ${date}` };
  }
  return null;
}
