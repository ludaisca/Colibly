"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Send, TimerOff, FastForward } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Spinner } from "@/app/components/ui/spinner";
import { cn } from "@/app/components/ui/cn";
import type { Graph, RunInput, RunState } from "@/lib/automations/types";

interface SimEntry {
  kind: "bot" | "effect" | "client" | "status";
  text: string;
  options?: { id: string; title: string }[];
  style?: "buttons" | "list";
}

interface SimFacts {
  name: string;
  tags: string[];
  dealStageIds: string[];
  customFields: Record<string, string | null>;
}

const OUTCOME_TEXT: Record<string, string> = {
  waiting_reply: "Esperando la respuesta del cliente",
  waiting_delay: "En espera de tiempo",
  completed: "Automatización terminada",
  handed_off: "Pasó a una persona del equipo",
  handed_to_bot: "Pasó al bot IA",
  expired: "Expiró",
  failed: "Falló",
  retry: "Falló un envío (se reintentaría)",
};

// "Probar": conversación simulada contra el borrador actual (sin guardar).
// Nada se envía de verdad ni toca el CRM; la IA sí es real.
export function Simulator({ automationId, graph, triggerText }: { automationId: string; graph: Graph; triggerText: string }) {
  const [entries, setEntries] = useState<SimEntry[]>([]);
  const [state, setState] = useState<RunState | null>(null);
  const [facts, setFacts] = useState<SimFacts>({ name: "Cliente de prueba", tags: [], dealStageIds: [], customFields: {} });
  const [status, setStatus] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const step = useCallback(
    async (input: RunInput, current: RunState | null, currentFacts: SimFacts, prefix: SimEntry[]) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/automations/${automationId}/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graph, state: current, input, facts: currentFacts }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "La simulación falló");
        setState(data.state);
        setFacts(data.facts);
        setStatus(data.outcome.status);
        const statusLine: SimEntry = {
          kind: "status",
          text: `${OUTCOME_TEXT[data.outcome.status] ?? data.outcome.status}${data.outcome.error ? `: ${data.outcome.error}` : ""}`,
        };
        setEntries([...prefix, ...data.transcript, statusLine]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "La simulación falló");
      } finally {
        setBusy(false);
      }
    },
    [automationId, graph]
  );

  const restart = useCallback(() => {
    const initialFacts = { name: "Cliente de prueba", tags: [], dealStageIds: [], customFields: {} };
    const opening: SimEntry[] = triggerText ? [{ kind: "client", text: triggerText }] : [];
    step({ kind: "start" }, null, initialFacts, opening);
  }, [step, triggerText]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- arranca la simulación al abrir el panel
    restart();
    // Solo al abrir: los cambios del grafo se prueban con "Reiniciar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries]);

  const reply = (value: string, replyId: string | null = null) => {
    if (!value.trim() || !state) return;
    const withoutStatus = entries.filter((e) => e.kind !== "status");
    step({ kind: "reply", text: value, replyId }, state, facts, [...withoutStatus, { kind: "client", text: value }]);
    setText("");
  };

  const lastBot = [...entries].reverse().find((e) => e.kind === "bot");
  const waitingReply = status === "waiting_reply";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-eyebrow font-medium uppercase tracking-wider text-muted-darker">Probar</p>
          <h2 className="font-display text-lg font-semibold">Conversación simulada</h2>
          <p className="text-xs text-muted">Usa el borrador actual. No se envía nada ni se modifica el CRM; la IA sí es real.</p>
        </div>
        <Button variant="secondary" size="sm" icon={RotateCcw} onClick={restart} disabled={busy}>
          Reiniciar
        </Button>
      </div>

      <div className="min-h-[320px] flex-1 space-y-2 overflow-y-auto rounded-xl border border-border bg-surface-light/40 p-3">
        {entries.map((e, i) =>
          e.kind === "effect" || e.kind === "status" ? (
            <p key={i} className={cn("text-center text-[11px]", e.kind === "status" ? "font-medium text-accent-ink" : "text-muted")}>
              {e.kind === "effect" ? `⚙ ${e.text}` : e.text}
            </p>
          ) : (
            <div key={i} className={cn("flex", e.kind === "client" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                  e.kind === "client" ? "rounded-tr-sm bg-accent text-on-accent" : "rounded-tl-sm bg-surface text-foreground shadow-sm"
                )}
              >
                {e.text}
                {e.options && (
                  <div className="mt-2 space-y-1 border-t border-border pt-2">
                    {e.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        disabled={busy || !waitingReply || e !== lastBot}
                        onClick={() => reply(o.title, o.id)}
                        className="block w-full rounded-lg border border-accent-muted px-2 py-1 text-xs font-medium text-accent-ink transition-colors hover:bg-accent-subtle disabled:opacity-50"
                      >
                        {o.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {busy && (
          <div className="flex justify-center py-2">
            <Spinner />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          reply(text);
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={waitingReply ? "Responde como el cliente…" : "La automatización no espera respuesta"} disabled={!waitingReply || busy} aria-label="Respuesta del cliente" className="flex-1" />
        <Button type="submit" icon={Send} disabled={!waitingReply || busy || !text.trim()} aria-label="Enviar" />
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {waitingReply && (
          <Button variant="ghost" size="sm" icon={TimerOff} disabled={busy} onClick={() => step({ kind: "timeout" }, state, facts, entries.filter((e) => e.kind !== "status"))}>
            Simular que no responde
          </Button>
        )}
        {status === "waiting_delay" && (
          <Button variant="ghost" size="sm" icon={FastForward} disabled={busy} onClick={() => step({ kind: "resume" }, state, facts, entries.filter((e) => e.kind !== "status"))}>
            Saltar la espera
          </Button>
        )}
      </div>
      {facts.tags.length > 0 && <p className="mt-2 text-[11px] text-muted">Etiquetas simuladas: {facts.tags.join(", ")}</p>}
    </div>
  );
}
