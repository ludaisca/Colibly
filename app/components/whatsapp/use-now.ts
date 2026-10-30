"use client";

import { useSyncExternalStore } from "react";

// Reloj compartido para no llamar Date.now() durante el render (la regla de
// pureza de React lo prohíbe). El snapshot cambia cada 30 s; suficiente para
// saber si un snooze sigue vigente.
const BUCKET_MS = 30_000;

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, BUCKET_MS);
  return () => clearInterval(id);
}

function getSnapshot() {
  return Math.floor(Date.now() / BUCKET_MS);
}

export function useNowBucket(): number {
  // 0 en el servidor: un valor estable evita un mismatch de hidratación si el
  // render del servidor y el cliente caen en buckets distintos.
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}

export function useNowMs(): number {
  return useNowBucket() * BUCKET_MS;
}
