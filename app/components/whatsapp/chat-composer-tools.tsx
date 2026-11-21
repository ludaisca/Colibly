"use client";

import { useCallback, useState } from "react";
import { ArrowLeft, FileText, ListChecks, PenLine, Plus, RefreshCw, Sticker } from "lucide-react";
import { Dropdown, DropdownItem } from "@/app/components/ui/dropdown";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import { Spinner, SpinningLoader } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { StickerPicker } from "./sticker-picker";
import type { Channel } from "./chat-shared";
import { AiMark } from "@/app/components/ui/ai-mark";

// Herramientas del composer agrupadas para que la barra no parezca una caja
// de herramientas: un botón de IA (sugerir / reescribir) y un "+" con botones,
// plantilla y stickers. Antes eran cinco iconos más el adjunto.


interface BotOption { id: string; name: string; isActive: boolean }

export function ChatAiMenu({
  chatId,
  draft,
  supportsSuggestions,
  disabled,
  onInsert,
}: {
  chatId: string;
  draft: string;
  supportsSuggestions: boolean;
  disabled?: boolean;
  onInsert: (text: string) => void;
}) {
  const { error: toastError } = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "suggest">("menu");
  const [botsLoaded, setBotsLoaded] = useState(false);
  const [bots, setBots] = useState<BotOption[]>([]);
  const [botId, setBotId] = useState("");
  const [loading, setLoading] = useState(false);
  const [rewriting, setRewriting] = useState(false);
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
    if (!next) {
      setView("menu");
      setSuggestion("");
      return;
    }
    if (supportsSuggestions && !botsLoaded) void fetchBots();
  }

  async function handleSuggest() {
    if (!botId || loading) return;
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

  async function handleRewrite() {
    if (!draft.trim() || rewriting) return;
    setRewriting(true);
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.text !== "string") {
        toastError(typeof body.error === "string" ? body.error : "No se pudo reescribir el borrador");
        return;
      }
      onInsert(body.text);
      setOpen(false);
    } finally {
      setRewriting(false);
    }
  }

  function useSuggestion() {
    onInsert(suggestion);
    setSuggestion("");
    setOpen(false);
  }

  return (
    <Dropdown
      panel
      panelLabel="Herramientas de IA"
      open={open}
      onOpenChange={handleOpenChange}
      align="left"
      portal
      closeOnSelect={false}
      trigger={
        <Button variant="ghost" size="icon" icon={AiMark} disabled={disabled} aria-label="Herramientas de IA" aria-expanded={open} type="button" />
      }
    >
      <div className="w-[min(21rem,calc(100vw-2rem))] p-1">
        {view === "menu" ? (
          <>
            {supportsSuggestions && (
              <DropdownItem icon={AiMark} onClick={() => setView("suggest")}>Sugerir respuesta</DropdownItem>
            )}
            <DropdownItem icon={rewriting ? SpinningLoader : PenLine} disabled={!draft.trim() || rewriting} onClick={() => void handleRewrite()}>Reescribir borrador</DropdownItem>
            {!draft.trim() && (
              <p className="px-2 pb-1 pt-1.5 text-xs text-muted-darker">Escribe algo para poder reescribirlo.</p>
            )}
          </>
        ) : (
          <div className="space-y-3 p-2">
            <Button type="button" variant="link" size="sm" icon={ArrowLeft} onClick={() => setView("menu")}>Herramientas de IA</Button>
            {!botsLoaded ? (
              <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Cargando bots…</div>
            ) : loadError ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">No se pudieron cargar los bots de esta cuenta.</p>
                <Button type="button" size="sm" variant="secondary" onClick={() => void fetchBots()} className="w-full">Reintentar</Button>
              </div>
            ) : bots.length === 0 ? (
              <p className="text-sm text-muted">Esta cuenta no tiene ningún bot configurado — crea uno en Bots IA para usar sugerencias.</p>
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
                  icon={loading ? RefreshCw : AiMark}
                  onClick={() => void handleSuggest()}
                  disabled={loading || !botId}
                  className="w-full"
                >
                  {loading ? "Generando…" : "Generar sugerencia"}
                </Button>
                {suggestion && (
                  <div className="space-y-2 border-t border-border pt-2">
                    <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-foreground">{suggestion}</p>
                    <Button type="button" size="sm" onClick={useSuggestion} className="w-full">Usar este texto</Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Dropdown>
  );
}

export function ChatMoreMenu({
  channel,
  disabled,
  supportsButtons,
  buttonsPanelOpen,
  buttonsDisabled,
  onToggleButtons,
  onOpenTemplates,
  onSendSticker,
  stickersDisabled,
}: {
  channel: Channel;
  disabled?: boolean;
  supportsButtons: boolean;
  buttonsPanelOpen: boolean;
  buttonsDisabled?: boolean;
  onToggleButtons: () => void;
  onOpenTemplates?: () => void;
  onSendSticker: (id: string) => Promise<void>;
  stickersDisabled?: boolean;
}) {
  const [stickersOpen, setStickersOpen] = useState(false);
  const hasStickers = channel === "WHATSAPP";

  return (
    <>
      <Dropdown
        align="left"
        portal
        trigger={
          <Button variant="ghost" size="icon" icon={Plus} disabled={disabled} aria-label="Más herramientas" type="button" />
        }
      >
        <div className="w-60">
          {supportsButtons && (
            <DropdownItem icon={ListChecks} disabled={buttonsDisabled} onClick={onToggleButtons}>
              {buttonsPanelOpen ? "Quitar botones de respuesta" : "Botones de respuesta"}
            </DropdownItem>
          )}
          {onOpenTemplates && (
            <DropdownItem icon={FileText} onClick={onOpenTemplates}>
              Enviar plantilla
            </DropdownItem>
          )}
          {hasStickers && (
            <DropdownItem icon={Sticker} disabled={stickersDisabled} onClick={() => setStickersOpen(true)}>
              Stickers
            </DropdownItem>
          )}
        </div>
      </Dropdown>
      {hasStickers && (
        <StickerPicker
          hideTrigger
          open={stickersOpen}
          onOpenChange={setStickersOpen}
          disabled={!!stickersDisabled}
          onSend={onSendSticker}
        />
      )}
    </>
  );
}
