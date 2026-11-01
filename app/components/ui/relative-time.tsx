"use client";

import { useSyncExternalStore } from "react";
import { formatInZone, formatRelative } from "@/lib/format/dates";

const ABSOLUTE: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

// Reloj compartido con resolución de minuto. Durante la hidratación React usa
// el snapshot del servidor (null) y luego vuelve a pintar con el del cliente.
function subscribeMinute(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);
const serverMinute = () => null;

/** Minuto actual (ms) en el cliente; null en el servidor y durante la hidratación. */
export function useMinuteNow(): number | null {
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, serverMinute);
  return minute === null ? null : minute * 60_000;
}

// "hace 2 días" con la fecha exacta al pasar el ratón (U8). El texto relativo
// depende del reloj, así que el servidor y el primer render del cliente pintan
// la fecha absoluta en una zona fija (idéntica en ambos: sin error de
// hidratación) y el relativo aparece al hidratar. Se refresca cada minuto.
export function RelativeTime({
  value,
  timeZone,
  className,
}: {
  value: Date | string;
  timeZone?: string;
  className?: string;
}) {
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, serverMinute);
  const now = minute === null ? null : new Date(minute * 60_000);

  const iso = typeof value === "string" ? value : value.toISOString();
  const absolute = formatInZone(iso, ABSOLUTE, timeZone);
  return (
    <time dateTime={iso} title={absolute} className={className}>
      {now ? formatRelative(iso, now) : absolute}
    </time>
  );
}
