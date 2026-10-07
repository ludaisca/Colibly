"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, UserRound, Zap, CircleOff, Handshake, Play, ChevronDown } from "lucide-react";
import { Button } from "@/app/components/kit/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@/app/components/kit/popover";
import { cn } from "@/app/components/kit/utils";
import { useToast } from "@/app/components/ui/toast";

interface ModeData {
  mode: "AI" | "HUMAN" | "AUTOMATION" | "HANDOFF" | "OFF";
  detail: string;
  until: string | null;
  canResume: boolean;
}

const MODE = {
  AI: { label: "IA atendiendo", icon: Bot },
  HUMAN: { label: "Humano atendiendo", icon: UserRound },
  AUTOMATION: { label: "Automatización", icon: Zap },
  HANDOFF: { label: "Pasado a humano", icon: Handshake },
  OFF: { label: "Sin atención automática", icon: CircleOff },
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

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/whatsapp/chats/${chatId}/bot-mode`, { cache: "no-store" });
      if (response.ok) setData(await response.json());
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
  const iconTone = { AI: "text-success-foreground", HUMAN: "text-warning-foreground", AUTOMATION: "text-accent-ink", HANDOFF: "text-warning-foreground", OFF: "text-muted-foreground" }[data.mode];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" title={data.detail} />}>
        <Icon className={cn(iconTone)} /> <span className={compact ? "hidden @2xl:inline" : undefined}>{compact ? compactLabel : view.label}</span><span className="sr-only">{compactLabel}</span> <ChevronDown className="opacity-60" />
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-72">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{view.label}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{data.detail}</p>
          {data.until && <p className="text-xs text-muted-foreground">{data.mode === "HUMAN" ? "Pausa hasta" : "Derivación hasta"}: {localTime(data.until)}</p>}
          {data.canResume && (
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={resume} loading={resuming}>
              <Play /> Devolver al bot
            </Button>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
