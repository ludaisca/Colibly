"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseSignupMessage } from "@/lib/whatsapp/embedded-signup/session";

// Flujo de Embedded Signup de Meta en el navegador (FB SDK + postMessage),
// compartido por el diálogo del panel y la página pública /conectar/<token>.
// Los dos resultados del diálogo llegan por caminos distintos y en cualquier
// orden: el `code` por el callback de FB.login y los ids por postMessage.

export interface SignupConfig {
  available: boolean;
  appId: string | null;
  configId: string | null;
  graphVersion: string;
  coexistenceAllowed: boolean;
  /** Solo en enlaces: por qué no se puede usar hoy. */
  blocker?: string | null;
}

interface FacebookSdk {
  init: (opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (cb: (res: { authResponse?: { code?: string } | null }) => void, opts: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

function loadFacebookSdk(appId: string, version: string): Promise<FacebookSdk> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }
    window.fbAsyncInit = () => {
      if (!window.FB) return reject(new Error("El SDK de Facebook no se inicializó"));
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/es_LA/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("No se pudo cargar el SDK de Facebook. Revisa tu conexión o el bloqueador de contenido."));
    document.body.appendChild(script);
  });
}

export type SignupMode = "new" | "coexistence";

export function useEmbeddedSignup<T extends Record<string, unknown>>(opts: {
  configUrl: string;
  completeUrl: string;
  onSuccess: (result: T) => void;
  onError?: (message: string) => void;
}) {
  const { configUrl, completeUrl } = opts;
  const onSuccess = useRef(opts.onSuccess);
  const onError = useRef(opts.onError);
  useEffect(() => {
    onSuccess.current = opts.onSuccess;
    onError.current = opts.onError;
  });

  const [config, setConfig] = useState<SignupConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<SignupMode>("new");
  const [busy, setBusy] = useState<"idle" | "dialog" | "saving">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const pending = useRef<{ code?: string; wabaId?: string; phoneNumberId?: string | null; coexistence?: boolean; mode: SignupMode }>({ mode: "new" });

  const submit = useCallback(async () => {
    const p = pending.current;
    if (!p.code || !p.wabaId) return;
    pending.current = { mode: p.mode };
    setBusy("saving");
    try {
      const res = await fetch(completeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: p.code, wabaId: p.wabaId, phoneNumberId: p.phoneNumberId || null, coexistence: p.coexistence ?? p.mode === "coexistence" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo conectar el número");
      onSuccess.current(json as T);
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo conectar el número";
      setProblem(message);
      onError.current?.(message);
    } finally {
      setBusy("idle");
    }
  }, [completeUrl]);

  useEffect(() => {
    fetch(configUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setConfig(await res.json());
        setLoadError(null);
      })
      .catch(() => setLoadError("No se pudo cargar la configuración de conexión."));
  }, [configUrl]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const parsed = parseSignupMessage(event.origin, event.data);
      if (parsed.kind === "finish") {
        pending.current = { ...pending.current, wabaId: parsed.wabaId, phoneNumberId: parsed.phoneNumberId || null, coexistence: parsed.coexistence };
        void submit();
      } else if (parsed.kind === "cancel") {
        setBusy("idle");
        setProblem("Cancelaste la conexión antes de terminar. Puedes intentarlo de nuevo.");
      } else if (parsed.kind === "error") {
        setBusy("idle");
        setProblem(parsed.message);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [submit]);

  const launch = useCallback(async () => {
    if (!config?.available || !config.appId || !config.configId) return;
    setProblem(null);
    setBusy("dialog");
    pending.current = { mode };
    try {
      const FB = await loadFacebookSdk(config.appId, config.graphVersion);
      FB.login(
        (res) => {
          const code = res.authResponse?.code;
          if (!code) {
            setBusy("idle");
            return;
          }
          pending.current = { ...pending.current, code };
          void submit();
        },
        {
          config_id: config.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {}, sessionInfoVersion: "3", ...(mode === "coexistence" ? { featureType: "whatsapp_business_app_onboarding" } : {}) },
        }
      );
    } catch (e) {
      setBusy("idle");
      setProblem(e instanceof Error ? e.message : "No se pudo abrir la conexión con Facebook.");
    }
  }, [config, mode, submit]);

  return { config, loadError, mode, setMode, busy, problem, launch };
}
