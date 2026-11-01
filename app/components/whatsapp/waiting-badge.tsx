"use client";

import { Hourglass } from "lucide-react";
import { formatInZone, minutesSince } from "@/lib/format/dates";
import { waitingLabel, waitingTone } from "@/lib/chats/waiting-shared";

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
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums ${TONE_CLASS[tone]}`}
      title={`Esperando respuesta desde ${formatInZone(since, { dateStyle: "medium", timeStyle: "short" })}`}
    >
      <Hourglass size={10} aria-hidden />
      {waitingLabel(minutes)}
    </span>
  );
}
