"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";

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

export function ChatDisplayNameBanner() {
  return (
    // Con el nombre en revisión el número queda "LIMITED" en Meta: a veces
    // entrega y a veces rechaza con 131037, también sin citar (visto el
    // 2026-11-01). No se bloquea el compositor porque Meta sí deja pasar
    // algunos envíos; el aviso dice la verdad y el error de Meta llega tal cual.
    <Banner tone="warning" title="Nombre para mostrar en revisión" className="mx-3 mb-2">
      WhatsApp todavía no aprueba el nombre de este número y mientras tanto puede rechazar tus mensajes, aunque no cites ni reacciones. Se resuelve cuando Meta lo apruebe en el Administrador de WhatsApp.
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
      {window.lastInboundAt
        ? "Pasaron más de 24 h desde el último mensaje del cliente. WhatsApp solo permite escribirle con una plantilla aprobada hasta que vuelva a responder."
        : "Este cliente todavía no te ha escrito. WhatsApp solo permite iniciar la conversación con una plantilla aprobada."}
    </Banner>
  );
}
