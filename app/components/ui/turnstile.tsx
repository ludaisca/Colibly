"use client";

import { useEffect, useRef } from "react";
import { TURNSTILE_ACTION } from "@/lib/turnstile-shared";

// Widget de Cloudflare Turnstile (captcha del registro). Carga el script una
// sola vez y renderiza en modo explícito. Cada token sirve una vez: tras un
// envío fallido, cambia `resetKey` para pedir uno nuevo.

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile no se inicializó")));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("No se pudo cargar Turnstile"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function Turnstile({
  siteKey,
  onToken,
  onLoadError,
  resetKey = 0,
  className,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  // El script no cargó (bloqueador, red): sin él no hay token posible.
  onLoadError?: () => void;
  resetKey?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // El callback cambia en cada render del formulario; el widget usa el último.
  const onTokenRef = useRef(onToken);
  const onLoadErrorRef = useRef(onLoadError);
  useEffect(() => {
    onTokenRef.current = onToken;
    onLoadErrorRef.current = onLoadError;
  }, [onToken, onLoadError]);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    onTokenRef.current(null);
    loadTurnstile()
      .then((api) => {
        if (cancelled || !ref.current) return;
        widgetId = api.render(ref.current, {
          sitekey: siteKey,
          // Siteverify compara esta acción: cambiarla aquí sin cambiarla en el
          // servidor (lib/turnstile.ts) rechaza todos los registros.
          action: TURNSTILE_ACTION,
          language: "es",
          // QA-009: el widget solo aparece si Cloudflare pide interacción; antes
          // mostraba "¡Operación exitosa!" antes de enviar el formulario.
          appearance: "interaction-only",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch((err) => {
        console.error("[turnstile]", err);
        if (!cancelled) onLoadErrorRef.current?.();
      });
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetKey]);

  return <div ref={ref} className={className} />;
}
