"use client";

import { useState } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Banner } from "@/app/components/ui/banner";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { BRAND_NAME } from "@/lib/brand";
import { loadFacebookSdk } from "@/app/components/whatsapp/use-embedded-signup";
import type { ConnectablePage } from "@/lib/meta-messaging/platform-connect";

export interface MessagingConnectConfig {
  available: boolean;
  appId: string | null;
  configId: string | null;
  graphVersion: string;
}

type Channel = "MESSENGER" | "INSTAGRAM";

const COPY = {
  MESSENGER: {
    title: "Conectar Página de Messenger",
    intro: "Inicia sesión con Facebook y elige las Páginas cuyos mensajes y comentarios quieres atender aquí.",
    pick: "Elige las Páginas que quieres conectar",
    empty: "Ninguna de las Páginas que autorizaste está disponible.",
  },
  INSTAGRAM: {
    title: "Conectar cuenta de Instagram",
    intro: "Inicia sesión con Facebook y elige las cuentas profesionales de Instagram (vinculadas a una Página) que quieres atender aquí.",
    pick: "Elige las cuentas de Instagram que quieres conectar",
    empty: "Ninguna de las Páginas que autorizaste tiene una cuenta de Instagram disponible.",
  },
} as const;

const STATE_NOTE: Record<string, string> = {
  connected: "Ya está conectada aquí",
  elsewhere: "Conectada en otra cuenta de " + BRAND_NAME,
  none: "Sin Instagram profesional vinculado",
};

// "Conectar con Facebook" (app de Meta de la plataforma): el diálogo de
// Facebook → elegir Páginas o cuentas de Instagram → crear las cuentas. Sin
// tokens ni secretos en el navegador (lib/meta-messaging/platform-connect.ts).
export function FacebookConnectModal({
  channel,
  config,
  open,
  onClose,
  onCreated,
  onManual,
}: {
  channel: Channel;
  config: MessagingConnectConfig;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onManual: () => void;
}) {
  const { success } = useToast();
  const [step, setStep] = useState<"start" | "dialog" | "pick" | "saving">("start");
  const [problem, setProblem] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pages, setPages] = useState<ConnectablePage[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const copy = COPY[channel];

  const stateOf = (p: ConnectablePage) => (channel === "MESSENGER" ? p.messenger : p.instagramState);

  function reset() {
    setStep("start");
    setProblem(null);
    setSessionId(null);
    setPages([]);
    setChosen(new Set());
  }

  function close() {
    reset();
    onClose();
  }

  async function openFacebook() {
    if (!config.appId || !config.configId) return;
    setProblem(null);
    setStep("dialog");
    try {
      const FB = await loadFacebookSdk(config.appId, config.graphVersion);
      FB.login(
        (res) => {
          const code = res.authResponse?.code;
          if (!code) {
            setStep("start");
            setProblem("Cerraste Facebook antes de terminar. Puedes intentarlo de nuevo.");
            return;
          }
          void loadPages(code);
        },
        { config_id: config.configId, response_type: "code", override_default_response_type: true }
      );
    } catch (e) {
      setStep("start");
      setProblem(e instanceof Error ? e.message : "No se pudo abrir Facebook");
    }
  }

  async function loadPages(code: string) {
    try {
      const res = await fetch("/api/meta/messaging-connect/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudieron leer tus Páginas");
      const list = json.pages as ConnectablePage[];
      setSessionId(json.sessionId);
      setPages(list);
      const available = list.filter((p) => (channel === "MESSENGER" ? p.messenger : p.instagramState) === "available");
      setChosen(new Set(available.length === 1 ? [available[0].id] : []));
      setStep("pick");
    } catch (e) {
      setStep("start");
      setProblem(e instanceof Error ? e.message : "No se pudieron leer tus Páginas");
    }
  }

  async function connect() {
    if (!sessionId || chosen.size === 0) return;
    setStep("saving");
    setProblem(null);
    try {
      const res = await fetch("/api/meta/messaging-connect/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, selections: [...chosen].map((pageId) => ({ pageId, channel })) }),
      });
      const json = await res.json().catch(() => ({}));
      const connected = (json.connected ?? []) as Array<{ name: string }>;
      const failed = (json.failed ?? []) as Array<{ pageId: string; error: string }>;
      if (connected.length > 0) {
        onCreated();
        success(connected.length === 1 ? `Conectaste ${connected[0].name}` : `Conectaste ${connected.length} cuentas`);
      }
      if (failed.length > 0 || !res.ok) {
        const names = new Map(pages.map((p) => [p.id, channel === "INSTAGRAM" && p.instagram?.username ? `@${p.instagram.username}` : p.name]));
        setProblem(json.error ?? failed.map((f) => `${names.get(f.pageId) ?? f.pageId}: ${f.error}`).join(" · "));
        setChosen(new Set());
        setStep("pick");
        return;
      }
      close();
    } catch (e) {
      setStep("pick");
      setProblem(e instanceof Error ? e.message : "No se pudo conectar");
    }
  }

  const visible = channel === "INSTAGRAM" ? pages.filter((p) => p.instagram) : pages;
  const anyAvailable = pages.some((p) => stateOf(p) === "available");

  return (
    <Modal
      open={open}
      onClose={close}
      title={copy.title}
      description={step === "pick" || step === "saving" ? copy.pick : copy.intro}
      size="md"
      footer={
        step === "pick" || step === "saving" ? (
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button onClick={connect} disabled={chosen.size === 0 || step === "saving"}>
              {step === "saving" ? <Spinner /> : "Conectar"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onManual}>Conectar a mano</Button>
            <Button onClick={openFacebook} disabled={step === "dialog"}>
              {step === "dialog" ? <Spinner /> : "Continuar con Facebook"}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {problem && <Banner tone="danger">{problem}</Banner>}
        {step === "pick" || step === "saving" ? (
          visible.length === 0 || !anyAvailable ? (
            <p className="text-sm text-muted">{copy.empty}</p>
          ) : (
            <div className="space-y-3">
              {visible.map((p) => {
                const state = stateOf(p);
                const label = channel === "INSTAGRAM" ? (p.instagram?.username ? `@${p.instagram.username}` : p.name) : p.name;
                const note = state === "available" ? (channel === "INSTAGRAM" ? `Página: ${p.name}` : undefined) : STATE_NOTE[state];
                return (
                  <Checkbox
                    key={p.id}
                    checked={chosen.has(p.id)}
                    disabled={state !== "available" || step === "saving"}
                    onChange={(on) =>
                      setChosen((prev) => {
                        const next = new Set(prev);
                        if (on) next.add(p.id);
                        else next.delete(p.id);
                        return next;
                      })
                    }
                    label={label}
                    description={note}
                  />
                );
              })}
            </div>
          )
        ) : (
          <p className="text-sm text-muted">
            Facebook te pedirá elegir las Páginas{channel === "INSTAGRAM" ? " y cuentas de Instagram" : ""} y aceptar los permisos. {BRAND_NAME} no ve tu
            contraseña ni guarda nada que no autorices; puedes quitar el acceso cuando quieras desde la configuración de tu Página.
          </p>
        )}
      </div>
    </Modal>
  );
}
