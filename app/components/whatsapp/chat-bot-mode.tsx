"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, UserRound, Zap, CircleOff, Handshake, Play, ChevronDown } from "lucide-react";
import { Dropdown, DropdownButton, DropdownItem } from "@/app/components/ui/dropdown";
import { useToast } from "@/app/components/ui/toast";

interface ModeData {
  mode: "AI" | "HUMAN" | "AUTOMATION" | "HANDOFF" | "OFF";
  detail: string;
  until: string | null;
  canResume: boolean;
}

const MODE = {
  AI: { label: "IA atendiendo", icon: Bot, tone: "border-success-border bg-success-bg text-success" },
  HUMAN: { label: "Humano atendiendo", icon: UserRound, tone: "border-warning-border bg-warning-bg text-warning" },
  AUTOMATION: { label: "Automatización", icon: Zap, tone: "border-accent-muted bg-accent-subtle text-accent-ink" },
  HANDOFF: { label: "Pasado a humano", icon: Handshake, tone: "border-warning-border bg-warning-bg text-warning" },
  OFF: { label: "Sin atención automática", icon: CircleOff, tone: "border-border bg-surface-light text-muted" },
} as const;

function localTime(value: string) {
  return new Date(value).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

// Estado por chat, calculado en el servidor con las mismas reglas del worker.
// La cita/estado de mensaje del polling provoca una recarga inmediata tras un
// envío manual; el intervalo cubre cambios de automatizaciones y expiraciones.
export function ChatBotMode({ chatId, refreshKey, compact = false }: { chatId: string; refreshKey: string; compact?: boolean }) {
  const { success, error: toastError } = useToast();
  const [data, setData] = useState<ModeData | null>(null);
  const [open, setOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  // Aviso local para lectores de pantalla cuando el modo cambia por el poll
  // (p. ej. un humano toma el chat y la IA se pausa). No suena en la carga
  // inicial ni al devolver el chat al bot (ya hay toast).
  const [modeNotice, setModeNotice] = useState("");
  const prevModeRef = useRef<ModeData["mode"] | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/whatsapp/chats/${chatId}/bot-mode`, { cache: "no-store" });
      if (response.ok) {
        const next: ModeData = await response.json();
        setData(next);
        if (prevModeRef.current && prevModeRef.current !== next.mode) setModeNotice(`Atención del chat: ${MODE[next.mode].label}`);
        prevModeRef.current = next.mode;
      }
    } catch {
      // El siguiente poll reintenta; no interrumpir el chat con toasts.
    }
  }, [chatId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consulta al cambiar el chat o su último mensaje
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 15_000);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  async function resume() {
    if (resuming) return;
    setResuming(true);
    try {
      const response = await fetch(`/api/whatsapp/chats/${chatId}/bot-mode`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo devolver el chat al bot");
      setData(body);
      prevModeRef.current = body.mode;
      setOpen(false);
      success("El bot responderá al próximo mensaje del lead");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "No se pudo devolver el chat al bot");
      load();
    } finally {
      setResuming(false);
    }
  }

  if (!data) return null;
  const view = MODE[data.mode];
  const Icon = view.icon;
  const compactLabel = { AI: "IA activa", HUMAN: "Atención manual", AUTOMATION: "Automatización", HANDOFF: "Derivado a humano", OFF: "IA inactiva" }[data.mode];
  const iconTone = { AI: "text-success", HUMAN: "text-warning", AUTOMATION: "text-accent-ink", HANDOFF: "text-warning", OFF: "text-muted-darker" }[data.mode];
  return (
    <>
    <span role="status" aria-live="polite" className="sr-only">{modeNotice}</span>
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      align="right"
      portal
      trigger={compact ? (
        <button type="button" aria-expanded={open} title={data.detail} className="inline-flex h-8 items-center gap-1.5 rounded-xl px-1 text-xs text-muted-darker hover:bg-surface-light hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-strong">
          <Icon size={14} className={iconTone} /> {compactLabel} <ChevronDown size={12} />
        </button>
      ) : <DropdownButton size="sm" icon={view.icon} label={view.label} className={`rounded-xl ${view.tone}`} />}
    >
      <div className="w-64 px-3.5 py-3">
        <p className="text-sm font-semibold text-foreground">{view.label}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-darker">{data.detail}</p>
        {data.until && <p className="mt-1 text-xs text-muted-darker">{data.mode === "HUMAN" ? "Pausa hasta" : "Derivación hasta"}: {localTime(data.until)}</p>}
        {data.canResume && (
          <div className="-mx-3.5 mt-2 border-t border-border pt-1">
            <DropdownItem icon={Play} onClick={resume} disabled={resuming}>Devolver al bot</DropdownItem>
          </div>
        )}
      </div>
    </Dropdown>
    </>
  );
}
