"use client";

import { Hourglass, TimerOff } from "lucide-react";
import { formatInZone, minutesSince } from "@/lib/format/dates";
import { waitingClock, waitingLabel, waitingSpoken, waitingTone } from "@/lib/chats/waiting-shared";

const TONE_CLASS = {
  muted: "text-muted-darker",
  warning: "text-warning",
  danger: "text-danger",
} as const;

// "espera 25 min" en la fila del chat: el cliente escribió y nadie contestó.
// Ámbar desde 15 min y rojo desde 60 (lib/chats/waiting.ts). `now` viene del
// reloj compartido (useNowMs) para no llamar Date.now() durante el render.
export function WaitingBadge({ since, now }: { since: string; now: number }) {
  const minutes = minutesSince(since, new Date(now));
  const tone = waitingTone(minutes);
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-micro font-medium tabular-nums ${TONE_CLASS[tone]}`}
      title={`Esperando respuesta desde ${formatInZone(since, { dateStyle: "medium", timeStyle: "short" })}`}
    >
      <Hourglass size={10} aria-hidden />
      {waitingLabel(minutes)}
    </span>
  );
}

// Fuera de SLA (lib/sla/): el tick avisó y el reloj sigue vencido.
export function SlaBadge({ response }: { response: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1 text-micro font-semibold text-danger bg-danger-bg"
      title={response ? "Fuera de SLA: se pasó el tiempo de respuesta" : "Fuera de SLA: se pasó el tiempo de resolución"}
    >
      <TimerOff size={10} aria-hidden />
      SLA
    </span>
  );
}

const LAMP_CLASS = { muted: "bg-transparent", warning: "bg-warning", danger: "bg-danger" } as const;
const DIGIT_CLASS = { muted: "text-foreground", warning: "text-warning", danger: "text-danger" } as const;

/**
 * Firma del mundo Andén: la espera como cifra de tablero ("1:12") en celdas
 * con línea de corte, y una lámpara a la izquierda (ámbar desde 15 min, roja
 * desde 60 o fuera de SLA). Cada celda se vuelve a montar cuando cambia su
 * carácter (la `key` lo incluye), así solo voltea lo que cambió; sin
 * animación con "reducir movimiento" (globals.css).
 */
export function WaitCells({ since, now, overdue = false }: { since: string; now: number; overdue?: boolean }) {
  const minutes = minutesSince(since, new Date(now));
  const tone = overdue ? "danger" : waitingTone(minutes);
  const clock = waitingClock(minutes);
  return (
    <span
      className="inline-flex items-center gap-[3px]"
      title={`Esperando respuesta desde ${formatInZone(since, { dateStyle: "medium", timeStyle: "short" })}`}
    >
      <span aria-hidden className={`mr-0.5 h-6 w-[5px] rounded-sm ${LAMP_CLASS[tone]}`} />
      <span className="sr-only">{waitingSpoken(minutes)}</span>
      {clock.split("").map((char, index) =>
        char === ":" ? (
          <span key={`sep-${index}`} aria-hidden className={`font-display text-base font-bold leading-none ${DIGIT_CLASS[tone]}`}>:</span>
        ) : (
          <span
            key={`${index}-${char}`}
            aria-hidden
            className={`animate-flap relative inline-flex h-6 min-w-4 items-center justify-center rounded-[3px] bg-cell px-[3px] font-display text-base font-bold leading-none tabular-nums ${DIGIT_CLASS[tone]} after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-foreground/10`}
          >
            {char}
          </span>
        )
      )}
    </span>
  );
}
