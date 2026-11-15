"use client";

import { useCallback, useEffect, useState } from "react";
import { Zap, Pause, Play, Square, History } from "lucide-react";
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem } from "@/app/components/ui/dropdown";
import { useToast } from "@/app/components/ui/toast";

interface ChatRun {
  id: string;
  status: string;
  automation: { id: string; name: string };
  step: string | null;
}

interface ChipData {
  runs: ChatRun[];
  manual: { id: string; name: string }[];
}

const STATUS_TEXT: Record<string, string> = {
  ACTIVE: "en curso",
  WAITING_DELAY: "esperando tiempo",
  WAITING_REPLY: "esperando respuesta",
  PAUSED_BY_AGENT: "pausada",
};

// Chip del encabezado del chat: qué automatización atiende esta conversación
// (y en qué paso va), con pausar/reanudar/terminar, más las automatizaciones
// manuales que se pueden iniciar a mano. No se muestra si no hay nada.
// Mismo patrón self-contained que ChatCostBadge (fetch propio por chat).
export function AutomationChip({ chatId, showEmpty = false }: { chatId: string; showEmpty?: boolean }) {
  const { success, error: toastError } = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ChipData | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/automations/chat/${chatId}`);
      if (res.ok) setData(await res.json());
    } catch {
      // informativo: si falla, simplemente no se muestra
    }
  }, [chatId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al cambiar de chat
    load();
    // Polling como el resto del inbox; se salta con la pestaña oculta.
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 20_000);
    return () => clearInterval(timer);
  }, [load]);

  async function act(runId: string, action: "pause" | "resume" | "cancel") {
    const res = await fetch(`/api/automations/runs/${runId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toastError(body.error ?? "No se pudo");
    success(action === "pause" ? "Automatización pausada" : action === "resume" ? "Automatización reanudada" : "Automatización terminada");
    load();
  }

  async function start(automationId: string) {
    const res = await fetch(`/api/automations/chat/${chatId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ automationId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toastError(body.error ?? "No se pudo iniciar");
    success("Automatización iniciada");
    setTimeout(load, 1500);
  }

  if (!data) return showEmpty ? <p className="text-xs text-muted-darker">Automatizaciones no disponibles todavía.</p> : null;
  if (data.runs.length === 0 && data.manual.length === 0) return showEmpty ? <p className="text-xs text-muted-darker">Sin automatizaciones en curso ni acciones manuales disponibles.</p> : null;
  const main = data.runs[0];

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      align="right"
      portal
      className="max-w-full"
      trigger={
        <DropdownButton
          size="sm"
          icon={Zap}
          label={main ? `${main.automation.name} · ${STATUS_TEXT[main.status] ?? main.status}` : "Automatizar"}
          className={`max-w-full [&>span]:truncate ${main && main.status !== "PAUSED_BY_AGENT" ? "border-accent-muted text-accent-ink" : ""}`}
        />
      }
    >
      <div className="w-72 py-1">
        {data.runs.map((run) => (
          <div key={run.id} className="px-3.5 py-2">
            <p className="truncate text-sm font-medium text-foreground">{run.automation.name}</p>
            <p className="text-micro text-muted-darker">
              {STATUS_TEXT[run.status] ?? run.status}
              {run.step ? ` · ${run.step}` : ""}
            </p>
            <div className="mt-1.5 -mx-3.5">
              {run.status === "PAUSED_BY_AGENT" ? (
                <DropdownItem icon={Play} onClick={() => act(run.id, "resume")}>Reanudar</DropdownItem>
              ) : (
                <DropdownItem icon={Pause} onClick={() => act(run.id, "pause")}>Pausar (yo sigo la conversación)</DropdownItem>
              )}
              <DropdownItem icon={Square} danger onClick={() => act(run.id, "cancel")}>Terminar</DropdownItem>
              <DropdownItem icon={History} onClick={() => window.open(`/whatsapp/automatizaciones/${run.automation.id}/ejecuciones`, "_self")}>
                Ver ejecuciones
              </DropdownItem>
            </div>
          </div>
        ))}
        {data.manual.length > 0 && (
          <>
            {data.runs.length > 0 && <DropdownDivider />}
            <p className="px-3.5 pb-1 pt-2 text-micro font-medium text-muted-darker">Iniciar automatización</p>
            {data.manual.map((m) => (
              <DropdownItem key={m.id} icon={Zap} onClick={() => start(m.id)}>
                {m.name}
              </DropdownItem>
            ))}
          </>
        )}
      </div>
    </Dropdown>
  );
}
