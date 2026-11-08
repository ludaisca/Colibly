"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { parseSignupMessage } from "@/lib/whatsapp/embedded-signup/session";

// Alta de un número de WhatsApp con un botón (Embedded Signup v4 de Meta): el
// negocio inicia sesión con Facebook, elige o crea su cuenta de WhatsApp Business
// y autoriza a Colibly. Sin copiar tokens ni secretos. Dos caminos: número nuevo
// o el número que ya usa en la app WhatsApp Business (coexistencia).

interface SignupConfig {
  available: boolean;
  appId: string | null;
  configId: string | null;
  graphVersion: string;
  coexistenceAllowed: boolean;
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

type Mode = "new" | "coexistence";

// Se monta solo mientras está abierto: cada apertura empieza con estado limpio sin
// reiniciar nada dentro de un efecto.
export function ConectarWhatsAppModal(props: { open: boolean; onClose: () => void; onConnected: () => void }) {
  return props.open ? <ConectarWhatsAppDialog onClose={props.onClose} onConnected={props.onConnected} /> : null;
}

function ConectarWhatsAppDialog({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const open = true;
  const { success, error: toastError } = useToast();
  const [config, setConfig] = useState<SignupConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("new");
  const [busy, setBusy] = useState<"idle" | "dialog" | "saving">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  // Los dos resultados del diálogo llegan por caminos distintos y en cualquier
  // orden: el `code` por el callback de FB.login y los ids por postMessage.
  const pending = useRef<{ code?: string; wabaId?: string; phoneNumberId?: string | null; coexistence?: boolean; mode: Mode }>({ mode: "new" });

  const submit = useCallback(async () => {
    const p = pending.current;
    if (!p.code || !p.wabaId) return;
    pending.current = { mode: p.mode };
    setBusy("saving");
    try {
      const res = await fetch("/api/whatsapp/embedded-signup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: p.code, wabaId: p.wabaId, phoneNumberId: p.phoneNumberId || null, coexistence: p.coexistence ?? p.mode === "coexistence" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo conectar el número");
      success(json.coexistence ? "Número conectado. Estamos sincronizando tus contactos y conversaciones." : "Número de WhatsApp conectado");
      onConnected();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo conectar el número";
      setProblem(message);
      toastError(message);
    } finally {
      setBusy("idle");
    }
  }, [onClose, onConnected, success, toastError]);

  useEffect(() => {
    fetch("/api/whatsapp/embedded-signup/config")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setConfig(await res.json());
        setLoadError(null);
      })
      .catch(() => setLoadError("No se pudo cargar la configuración de conexión."));
  }, []);

  useEffect(() => {
    if (!open) return;
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
  }, [open, submit]);

  async function launch() {
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
          extras: {
            setup: {},
            sessionInfoVersion: "3",
            ...(mode === "coexistence" ? { featureType: "whatsapp_business_app_onboarding" } : {}),
          },
        }
      );
    } catch (e) {
      setBusy("idle");
      setProblem(e instanceof Error ? e.message : "No se pudo abrir la conexión con Facebook.");
    }
  }

  const loading = !config && !loadError;
  const disabled = busy !== "idle" || !config?.available;

  return (
    <Modal
      open={open}
      onClose={busy === "saving" ? () => {} : onClose}
      title="Conectar WhatsApp"
      description="Conecta tu número con Facebook, sin copiar tokens ni secretos."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy === "saving"}>Cancelar</Button>
          <Button onClick={launch} loading={busy !== "idle"} disabled={disabled}>
            {busy === "saving" ? "Conectando…" : "Continuar con Facebook"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {loading && <div className="flex items-center gap-3 text-sm text-muted-darker"><Spinner /> Cargando…</div>}
        {loadError && <Banner tone="danger">{loadError}</Banner>}
        {config && !config.available && (
          <Banner tone="warning" title="Conexión con un clic no disponible todavía">
            Aún estamos terminando la configuración con Meta. Mientras tanto puedes usar &quot;Conexión manual&quot;.
          </Banner>
        )}
        {problem && <Banner tone="danger">{problem}</Banner>}

        {config?.available && (
          <fieldset className="space-y-2" disabled={busy !== "idle"}>
            <legend className="mb-1 text-sm font-medium">¿Qué número quieres conectar?</legend>
            <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-foreground has-[:checked]:ring-1 has-[:checked]:ring-foreground">
              <input type="radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} className="mt-1" />
              <span className="text-sm">
                <span className="block font-medium">Un número nuevo</span>
                <span className="text-muted-darker">Un número que no está en WhatsApp ni en la app WhatsApp Business.</span>
              </span>
            </label>
            {config.coexistenceAllowed && (
              <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-foreground has-[:checked]:ring-1 has-[:checked]:ring-foreground">
                <input type="radio" name="mode" checked={mode === "coexistence"} onChange={() => setMode("coexistence")} className="mt-1" />
                <span className="text-sm">
                  <span className="block font-medium">El número que ya uso en la app WhatsApp Business</span>
                  <span className="text-muted-darker">
                    Sigues contestando desde tu teléfono y todo se ve también en Colibly. Puedes compartir tu historial de los últimos 180
                    días (lo eliges en tu teléfono). Necesitas la app WhatsApp Business actualizada y abierta durante la conexión.
                  </span>
                </span>
              </label>
            )}
          </fieldset>
        )}
        <p className="text-xs text-muted-darker">
          Para enviar mensajes, Meta te pedirá agregar un método de pago en el Administrador de WhatsApp. Esos cargos son de Meta, aparte de tu plan de Colibly.
        </p>
      </div>
    </Modal>
  );
}
