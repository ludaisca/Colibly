"use client";

import { useEffect, useRef } from "react";

// Sondeo común de la app (R4 de docs/RENDIMIENTO_2026-11-04.md). No hay
// websockets: todo lo "en vivo" se consulta. Este hook evita que cada
// componente reinvente su setInterval con reglas distintas:
// - nunca solapa peticiones (programa el siguiente tick al terminar el actual);
// - con la pestaña oculta no consulta (o lo hace cada `hiddenMs`), y al volver
//   sondea de inmediato;
// - si el usuario lleva un rato sin tocar nada, espacia los ticks (como
//   Chatwoot al quedar inactivo) y vuelve al ritmo normal con la primera
//   interacción, consultando en ese momento.

const IDLE_SLOW_MS = 2 * 60_000; // tras 2 min sin actividad: ×3
const IDLE_SLOWER_MS = 10 * 60_000; // tras 10 min: ×6
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "focus"] as const;

// Una sola marca de actividad para toda la pestaña (no un listener por hook).
let lastActivity = typeof window === "undefined" ? 0 : Date.now();
const wakeListeners = new Set<() => void>();
let listening = false;
function ensureActivityTracking() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const mark = () => {
    const wasIdle = Date.now() - lastActivity > IDLE_SLOW_MS;
    lastActivity = Date.now();
    if (wasIdle) for (const wake of wakeListeners) wake();
  };
  for (const event of ACTIVITY_EVENTS) window.addEventListener(event, mark, { passive: true, capture: true });
}

/** Multiplicador del intervalo según el tiempo sin actividad (puro, para probarlo). */
export function idleFactor(idleMs: number): number {
  if (idleMs > IDLE_SLOWER_MS) return 6;
  if (idleMs > IDLE_SLOW_MS) return 3;
  return 1;
}

export interface PollOptions {
  /** Intervalo con la pestaña visible y el usuario activo. */
  intervalMs: number;
  /** Con la pestaña oculta: cada cuánto consultar; sin valor, no se consulta. */
  hiddenMs?: number;
  /** Tope del intervalo al espaciar por inactividad. */
  maxIntervalMs?: number;
  /** Consultar al montar (por defecto sí). */
  immediate?: boolean;
  /** Apagar el sondeo sin desmontar (por defecto encendido). */
  enabled?: boolean;
}

/**
 * Llama a `poll` periódicamente. `poll` recibe `{ hidden }` para que un caller
 * pueda hacer algo más barato con la pestaña oculta. Para reiniciar el ciclo
 * (p. ej. al cambiar de chat), cambia las dependencias de `poll` (useCallback).
 */
export function usePoll(poll: (ctx: { hidden: boolean }) => Promise<unknown> | void, options: PollOptions): void {
  const { intervalMs, hiddenMs, maxIntervalMs = 60_000, immediate = true, enabled = true } = options;
  const pollRef = useRef(poll);
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    if (!enabled) return;
    ensureActivityTracking();
    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      const hidden = document.visibilityState === "hidden";
      if (hidden && hiddenMs === undefined) return; // se reanuda al volver la visibilidad
      const base = hidden ? (hiddenMs as number) : Math.min(intervalMs * idleFactor(Date.now() - lastActivity), Math.max(intervalMs, maxIntervalMs));
      timer = setTimeout(() => void run(), base);
    };

    const run = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        await pollRef.current({ hidden: document.visibilityState === "hidden" });
      } catch {
        // Cada caller decide qué hacer con sus errores; el ciclo sigue.
      } finally {
        running = false;
        schedule();
      }
    };

    const now = () => {
      if (timer) clearTimeout(timer);
      void run();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") now();
      else schedule();
    };

    if (immediate) void run();
    else schedule();
    document.addEventListener("visibilitychange", onVisible);
    wakeListeners.add(now);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      wakeListeners.delete(now);
    };
  }, [enabled, hiddenMs, immediate, intervalMs, maxIntervalMs, poll]);
}
