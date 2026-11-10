"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";
import { HelpHint } from "@/app/components/ui/help-hint";

export interface ChatWindowState {
  open: boolean;
  lastInboundAt: string | null;
  expiresAt: string | null;
}

// Estado de la ventana de 24 h; `refreshKey` cambia cuando llega un entrante.
export function useChatServiceWindow(chatId: string | null, enabled: boolean, refreshKey: string | null): ChatWindowState | null {
  const [state, setState] = useState<{ chatId: string; value: ChatWindowState } | null>(null);
  useEffect(() => {
    if (!chatId || !enabled) return;
    const controller = new AbortController();
    fetch(`/api/whatsapp/chats/${chatId}/window`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((value: ChatWindowState | null) => { if (value && !controller.signal.aborted) setState({ chatId, value }); })
      .catch(() => {});
    // Re-evalúa al vencer la ventana aunque no llegue nada nuevo.
    const timer = setInterval(() => {
      setState((prev) => prev && prev.value.open && prev.value.expiresAt && Date.parse(prev.value.expiresAt) <= Date.now() ? { ...prev, value: { ...prev.value, open: false } } : prev);
    }, 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [chatId, enabled, refreshKey]);
  return enabled && state?.chatId === chatId ? state.value : null;
}

// En el teléfono los dos avisos juntos ocupaban ~300 px y dejaban un tercio de
// pantalla al hilo (revisión 2026-11-07): ahí se ve el título y la explicación
// se abre con "Por qué"; desde md se ve completa.
function WhyText({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span className={open ? undefined : "max-md:hidden"}>{children}</span>
      <Button type="button" variant="link" size="sm" className="md:hidden" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "Ocultar" : "Por qué"}
      </Button>
    </>
  );
}

function displayNameDismissKey(accountId: string) {
  return `colibly:display-name-banner:${accountId}`;
}

// Se descarta por cuenta y se recuerda en este navegador (como los borradores):
// el estado del nombre puede tardar días en resolverse y el aviso no debe
// estorbar en cada chat. El padre lo monta con `key={accountId}`.
export function ChatDisplayNameBanner({ accountId }: { accountId: string }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(displayNameDismissKey(accountId)) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(displayNameDismissKey(accountId), "1");
    } catch {}
  }

  return (
    // Con el nombre en revisión el número queda "LIMITED" en Meta: a veces
    // entrega y a veces rechaza con 131037, también sin citar (visto el
    // 2026-11-01). No se bloquea el compositor porque Meta sí deja pasar
    // algunos envíos; el aviso dice la verdad y el error de Meta llega tal cual.
    <Banner tone="warning" title="Nombre para mostrar en revisión" className="mx-3 mb-2" onClose={dismiss}>
      <WhyText>WhatsApp todavía no aprueba el nombre de este número y mientras tanto puede rechazar tus mensajes, aunque no cites ni reacciones. Se resuelve cuando Meta lo apruebe en el Administrador de WhatsApp.</WhyText>
    </Banner>
  );
}

export function ChatWindowBanner({ window, onSendTemplate }: { window: ChatWindowState; onSendTemplate: () => void }) {
  if (window.open) return null;
  return (
    <Banner
      tone="warning"
      title="Ventana de 24 h cerrada"
      className="mx-3 mb-2"
      action={<Button size="sm" icon={FileText} onClick={onSendTemplate}>Enviar plantilla</Button>}
    >
      <span className="mr-1 inline-flex align-middle"><HelpHint term="window24h" /></span>
      <WhyText>
        {window.lastInboundAt
          ? "Pasaron más de 24 h desde el último mensaje del cliente. WhatsApp solo permite escribirle con una plantilla aprobada hasta que vuelva a responder."
          : "Este cliente todavía no te ha escrito. WhatsApp solo permite iniciar la conversación con una plantilla aprobada."}
      </WhyText>
    </Banner>
  );
}
