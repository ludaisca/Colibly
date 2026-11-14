"use client";

import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { useEmbeddedSignup } from "@/app/components/whatsapp/use-embedded-signup";

// Alta de un número de WhatsApp con un botón (Embedded Signup v4 de Meta): el
// negocio inicia sesión con Facebook, elige o crea su cuenta de WhatsApp Business
// y autoriza a Colibly. Sin copiar tokens ni secretos. Dos caminos: número nuevo
// o el número que ya usa en la app WhatsApp Business (coexistencia).

// Se monta solo mientras está abierto: cada apertura empieza con estado limpio sin
// reiniciar nada dentro de un efecto.
export function ConectarWhatsAppModal(props: { open: boolean; onClose: () => void; onConnected: () => void }) {
  return props.open ? <ConectarWhatsAppDialog onClose={props.onClose} onConnected={props.onConnected} /> : null;
}

function ConectarWhatsAppDialog({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const open = true;
  const { success, error: toastError } = useToast();
  const { config, loadError, mode, setMode, busy, problem, launch } = useEmbeddedSignup<{ coexistence?: boolean }>({
    configUrl: "/api/whatsapp/embedded-signup/config",
    completeUrl: "/api/whatsapp/embedded-signup/complete",
    onSuccess: (json) => {
      success(json.coexistence ? "Número conectado. Estamos sincronizando tus contactos y conversaciones." : "Número de WhatsApp conectado");
      onConnected();
      onClose();
    },
    onError: (message) => toastError(message),
  });

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
