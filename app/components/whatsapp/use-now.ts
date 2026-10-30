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
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useNowMs(): number {
  return useNowBucket() * BUCKET_MS;
}
