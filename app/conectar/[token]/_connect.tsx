"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { useEmbeddedSignup } from "@/app/components/whatsapp/use-embedded-signup";

export function ConnectWhatsApp({ token }: { token: string }) {
  const [done, setDone] = useState<{ coexistence: boolean } | null>(null);
  const endpoint = `/api/whatsapp/embedded-signup/link/${encodeURIComponent(token)}`;
  const { config, loadError, mode, setMode, busy, problem, launch } = useEmbeddedSignup<{ coexistence?: boolean; redirectUrl?: string | null }>({
    configUrl: endpoint,
    completeUrl: endpoint,
    onSuccess: (json) => {
      if (json.redirectUrl) {
        window.location.assign(json.redirectUrl);
        return;
      }
      setDone({ coexistence: !!json.coexistence });
    },
  });

  if (done) {
    return (
      <div className="mt-6 text-center">
        <CheckCircle2 size={28} className="mx-auto text-success" aria-hidden />
        <p className="mt-3 font-medium text-foreground">Tu número quedó conectado</p>
        <p className="mt-1 text-sm text-muted-darker">
          {done.coexistence ? "Sigues usando tu app WhatsApp Business como siempre. " : ""}Ya puedes cerrar esta página.
        </p>
      </div>
    );
  }

  if (!config && !loadError) {
    return (
      <div className="mt-6 flex items-center gap-3 text-sm text-muted-darker">
        <Spinner /> Cargando…
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      {loadError && <Banner tone="danger">{loadError}</Banner>}
      {config?.blocker && <Banner tone="warning">{config.blocker}</Banner>}
      {config && !config.available && <Banner tone="warning">La conexión con Facebook no está disponible en este momento. Intenta más tarde.</Banner>}
      {problem && <Banner tone="danger">{problem}</Banner>}

      {config?.available && !config.blocker && (
        <>
          <fieldset className="space-y-2" disabled={busy !== "idle"}>
            <legend className="mb-1 text-sm font-medium text-foreground">¿Qué número quieres conectar?</legend>
            <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-foreground has-[:checked]:ring-1 has-[:checked]:ring-foreground">
              <input type="radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} className="mt-1" />
              <span className="text-sm">
                <span className="block font-medium text-foreground">Un número nuevo</span>
                <span className="text-muted-darker">Un número que no está en WhatsApp ni en la app WhatsApp Business.</span>
              </span>
            </label>
            {config.coexistenceAllowed && (
              <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-foreground has-[:checked]:ring-1 has-[:checked]:ring-foreground">
                <input type="radio" name="mode" checked={mode === "coexistence"} onChange={() => setMode("coexistence")} className="mt-1" />
                <span className="text-sm">
                  <span className="block font-medium text-foreground">El número que ya uso en la app WhatsApp Business</span>
                  <span className="text-muted-darker">Sigues contestando desde tu teléfono. Necesitas la app actualizada y abierta durante la conexión.</span>
                </span>
              </label>
            )}
          </fieldset>
          <Button className="w-full" onClick={launch} loading={busy !== "idle"} disabled={busy !== "idle"}>
            {busy === "saving" ? "Conectando…" : "Continuar con Facebook"}
          </Button>
          <p className="text-xs text-muted-darker">
            Meta te pedirá iniciar sesión con Facebook y elegir tu cuenta de WhatsApp Business. Para enviar mensajes, Meta pide un método de pago en el Administrador de WhatsApp; esos cargos son de Meta.
          </p>
        </>
      )}
    </div>
  );
}
