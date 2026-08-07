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

  const fetchBots = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/suggest-reply`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setBots(data);
        setBotId((prev) => (data.some((b: BotOption) => b.id === prev) ? prev : data[0]?.id ?? ""));
      }
    } catch {
      // silencioso — el popover solo muestra "sin bots" si esto falla
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
      trigger={
        // Un <div>, no <button>: Dropdown ya envuelve el trigger en su propio
        // div[role=button] (ver dropdown.tsx) — anidar un <button> real aquí
        // duplica el nodo interactivo en el árbol de accesibilidad (mismo
        // problema documentado en AGENTS.md para <Button> dentro de <Link>).
        // Mismo motivo por el que DropdownButton (usado por LeadScoreBadge/
        // ChatCostBadge/ChatTagPicker) renderiza un div en vez de un button.
        <div
          className="text-accent hover:text-accent/80 transition-colors p-2.5 rounded-lg border border-accent/30 bg-accent/10 hover:bg-accent/15 shrink-0"
          title="Sugerir respuesta con IA"
          aria-label="Sugerir respuesta con IA"
        >
          <Sparkles size={20} />
        </div>
      }
    >
      <div className="p-3 w-80 space-y-3">
        {!botsLoaded ? (
          <p className="text-sm text-muted">Cargando bots...</p>
        ) : bots.length === 0 ? (
          <p className="text-sm text-muted">
            Esta cuenta no tiene ningún bot configurado — crea uno en Bots IA para poder usar sugerencias de IA.
          </p>
        ) : (
          <>
            <Select value={botId} onChange={(e) => setBotId(e.target.value)}>
              {bots.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{!b.isActive ? " (pausado)" : ""}</option>
              ))}
            </Select>
            <Button
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
                <p className="text-sm text-foreground whitespace-pre-wrap">{suggestion}</p>
                <Button size="sm" onClick={handleUse} className="w-full">
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
