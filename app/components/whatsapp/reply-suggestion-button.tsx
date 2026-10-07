"use client";

import { useState, useCallback } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/app/components/kit/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@/app/components/kit/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/app/components/kit/select";
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

  const botLabel = (id: string) => { const b = bots.find((x) => x.id === id); return b ? `${b.name}${!b.isActive ? " (pausado)" : ""}` : "Elige un bot"; };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="Sugerir respuesta con IA" title="Sugerir respuesta con IA" />}>
        <Sparkles className="text-accent-ink" /> <span className="hidden @xl:inline">Sugerir con IA</span>
      </PopoverTrigger>
      <PopoverPopup align="start" side="top" className="w-80">
        <div className="space-y-3">
          {!botsLoaded ? (
            <p className="text-sm text-muted-foreground">Cargando bots...</p>
          ) : loadError ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No se pudieron cargar los bots de esta cuenta.</p>
              <Button size="sm" variant="outline" onClick={fetchBots} className="w-full">Reintentar</Button>
            </div>
          ) : bots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Esta cuenta no tiene ningún bot configurado — crea uno en Bots IA para poder usar sugerencias de IA.
            </p>
          ) : (
            <>
              <Select value={botId} onValueChange={(v) => v && setBotId(v)}>
                <SelectTrigger aria-label="Bot para sugerir respuesta"><SelectValue>{botLabel(botId)}</SelectValue></SelectTrigger>
                <SelectPopup>
                  {bots.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}{!b.isActive ? " (pausado)" : ""}</SelectItem>)}
                </SelectPopup>
              </Select>
              <Button size="sm" variant="outline" onClick={handleSuggest} disabled={loading || !botId} className="w-full">
                {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {loading ? "Generando..." : "Generar sugerencia"}
              </Button>
              {suggestion && (
                <div className="space-y-2 border-t pt-3">
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-foreground">{suggestion}</p>
                  <Button size="sm" onClick={handleUse} className="w-full">Usar este texto</Button>
                </div>
              )}
            </>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
