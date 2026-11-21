"use client";

import { Modal } from "@/app/components/ui/modal";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
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
          <RadioList
            label="¿Qué número quieres conectar?"
            value={mode}
            onChange={(next) => setMode(next as typeof mode)}
            isDisabled={busy !== "idle"}
          >
            <RadioListItem
              value="new"
              label="Un número nuevo"
              description="Un número que no está en WhatsApp ni en la app WhatsApp Business."
            />
            {config.coexistenceAllowed && (
              <RadioListItem
                value="coexistence"
                label="El número que ya uso en la app WhatsApp Business"
                description="Sigues contestando desde tu teléfono y todo se ve también en Colibly. Puedes compartir tu historial de los últimos 180 días (lo eliges en tu teléfono). Necesitas la app WhatsApp Business actualizada y abierta durante la conexión."
              />
            )}
          </RadioList>
        )}
        <p className="text-xs text-muted-darker">
          Para enviar mensajes, Meta te pedirá agregar un método de pago en el Administrador de WhatsApp. Esos cargos son de Meta, aparte de tu plan de Colibly.
        </p>
      </div>
    </Modal>
  );
}
