"use client";

import { useState, useCallback } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Dropdown } from "@/app/components/ui/dropdown";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import { useToast } from "@/app/components/ui/toast";

// Copiloto de IA (roadmap P3-e) — botón en el compositor del chat, mismo
// patrón self-contained que LeadScoreBadge/ChatCostBadge (fetch propio, solo
// recibe chatId). A diferencia de esos, la acción principal (onInsert) nunca
// escribe nada por su cuenta — solo llena el input para que el agente decida.

interface BotOption { id: string; name: string; isActive: boolean }

export function ReplySuggestionButton({ chatId, onInsert }: { chatId: string; onInsert: (text: string) => void }) {
  const { error: toastError } = useToast();
  const [open, setOpen] = useState(false);
  const [botsLoaded, setBotsLoaded] = useState(false);
  const [bots, setBots] = useState<BotOption[]>([]);
  const [botId, setBotId] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [loadError, setLoadError] = useState(false);

  const fetchBots = useCallback(async () => {
    setBotsLoaded(false);
    setLoadError(false);
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/suggest-reply`);
      if (!res.ok) throw new Error("No se pudieron cargar los bots");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Respuesta inválida");
      setBots(data);
      setBotId((prev) => (data.some((b: BotOption) => b.id === prev) ? prev : data[0]?.id ?? ""));
    } catch {
      setLoadError(true);
    } finally {
      setBotsLoaded(true);
    }
  }, [chatId]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Carga perezosa — solo al abrir por primera vez, no en cada render del
    // compositor (a diferencia de LeadScoreBadge, que sí carga siempre porque
    // el badge necesita mostrar el último score aunque el popover esté cerrado).
    if (next && !botsLoaded) fetchBots();
  }

  async function handleSuggest() {
    if (!botId) return;
    setLoading(true);
    setSuggestion("");
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/suggest-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al generar la sugerencia");
      setSuggestion(data.suggestion);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al generar la sugerencia");
    } finally {
      setLoading(false);
    }
  }

  function handleUse() {
    onInsert(suggestion);
    setSuggestion("");
    setOpen(false);
  }

  return (
    <Dropdown
      open={open}
      onOpenChange={handleOpenChange}
      align="left"
      portal
      closeOnSelect={false}
      trigger={
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-surface-light focus-visible:outline-2 focus-visible:outline-accent-strong sm:min-h-0 sm:h-9"
          aria-expanded={open}
        >
          <Sparkles size={16} className="text-accent-ink" />
          <span>Sugerir con IA</span>
        </button>
      }
    >
      <div className="w-[min(20rem,calc(100vw-2rem))] space-y-3 p-3">
        {!botsLoaded ? (
          <p className="text-sm text-muted">Cargando bots...</p>
        ) : loadError ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">No se pudieron cargar los bots de esta cuenta.</p>
            <Button type="button" size="sm" variant="secondary" onClick={fetchBots} className="w-full">Reintentar</Button>
          </div>
        ) : bots.length === 0 ? (
          <p className="text-sm text-muted">
            Esta cuenta no tiene ningún bot configurado — crea uno en Bots IA para poder usar sugerencias de IA.
          </p>
        ) : (
          <>
            <Select aria-label="Bot para sugerir respuesta" value={botId} onChange={(e) => setBotId(e.target.value)}>
              {bots.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{!b.isActive ? " (pausado)" : ""}</option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={loading ? RefreshCw : Sparkles}
              onClick={handleSuggest}
              disabled={loading || !botId}
              className="w-full"
            >
              {loading ? "Generando..." : "Generar sugerencia"}
            </Button>
            {suggestion && (
              <div className="space-y-2 pt-1 border-t border-border">
                <p className="max-h-40 overflow-y-auto text-sm text-foreground whitespace-pre-wrap">{suggestion}</p>
                <Button type="button" size="sm" onClick={handleUse} className="w-full">
                  Usar este texto
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Dropdown>
  );
}
