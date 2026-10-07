"use client";

import { useEffect, useRef } from "react";
import { Send, Paperclip, X, FileAudio, Video, FileText, ListChecks, Plus, Reply, Loader2 } from "lucide-react";
import { Button } from "@/app/components/kit/button";
import { Input } from "@/app/components/kit/input";
import { cn } from "@/app/components/kit/utils";
import { isImageMime, isAudioMime, isVideoMime } from "@/lib/whatsapp/media-shared";
import { ReplySuggestionButton } from "./reply-suggestion-button";
import { StickerPicker } from "./sticker-picker";
import type { CannedResponseItem, Channel, Message } from "./chat-shared";

// Input + adjuntos + respuestas rápidas — extraído de chat-workspace.tsx sin
// tocar el envío optimista (vive en el orquestador, que sigue siendo dueño de
// `newMessage`/`attachment`/`performSend`; este panel solo dispara callbacks).

interface ChatComposerProps {
  chatId: string;
  channel: Channel;
  newMessage: string;
  onMessageChange: (value: string) => void;
  sending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onSendSticker: (id: string) => Promise<void>;
  replyTo: Message | null;
  leadName: string;
  onCancelReply: () => void;

  attachment: File | null;
  attachmentPreview: string | null;
  onPickFile: () => void;
  onFileChosen: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearAttachment: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;

  cannedSuggestions: CannedResponseItem[];
  cannedIndex: number;
  onCannedIndexChange: (index: number) => void;
  onInsertCanned: (content: string) => void;

  // Se deshabilita si ya hay botones cargados: un mensaje interactivo (solo
  // WhatsApp) no lleva medio.
  attachmentsDisabled?: boolean;

  // Botones de respuesta rápida (máx. 3, solo WhatsApp Meta) — ver
  // "Mensajes interactivos" en AGENTS.md.
  interactiveButtons: string[];
  onButtonsChange: (buttons: string[]) => void;
  buttonsPanelOpen: boolean;
  onToggleButtonsPanel: () => void;
  interactiveDisabled?: boolean;
}

const MAX_BUTTONS = 3;
const MAX_BUTTON_LENGTH = 20;
const MAX_TEXTAREA_PX = 160;

export function ChatComposer({
  chatId,
  channel,
  newMessage,
  onMessageChange,
  sending,
  onSubmit,
  onSendSticker,
  replyTo,
  leadName,
  onCancelReply,
  attachment,
  attachmentPreview,
  onPickFile,
  onFileChosen,
  onClearAttachment,
  fileInputRef,
  cannedSuggestions,
  cannedIndex,
  onCannedIndexChange,
  onInsertCanned,
  attachmentsDisabled = false,
  interactiveButtons,
  onButtonsChange,
  buttonsPanelOpen,
  onToggleButtonsPanel,
  interactiveDisabled = false,
}: ChatComposerProps) {
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const supportsAttachments = channel !== "WEBCHAT";
  const supportsButtons = channel === "WHATSAPP";
  const supportsSuggestions = channel === "WHATSAPP" || channel === "TELEGRAM";

  // El textarea crece con el texto hasta un tope y luego desplaza.
  useEffect(() => {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [newMessage]);

  function toggleButtons() {
    if (buttonsPanelOpen) {
      onButtonsChange([]);
    } else if (interactiveButtons.length === 0) {
      onButtonsChange([""]);
    }
    onToggleButtonsPanel();
  }

  function insertSuggestion(text: string) {
    onMessageChange(text);
    messageInputRef.current?.focus();
  }

  const cannotSend =
    (!newMessage.trim() && !attachment && interactiveButtons.length === 0) ||
    (interactiveButtons.length > 0 && (!newMessage.trim() || interactiveButtons.some((t) => !t.trim()))) ||
    sending;

  return (
    <form onSubmit={onSubmit} className="@container relative shrink-0 border-t bg-card px-4 pb-3 pt-3 sm:px-6">
      {cannedSuggestions.length > 0 && (
        <div className="chat-disclosure-enter absolute inset-x-4 bottom-full z-20 mb-1.5 overflow-hidden rounded-xl border bg-popover shadow-lg sm:inset-x-6">
          {cannedSuggestions.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onInsertCanned(c.content)}
              onMouseEnter={() => onCannedIndexChange(i)}
              className={cn("w-full border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0", i === cannedIndex ? "bg-surface-light" : "hover:bg-surface-light")}
            >
              <span className="font-semibold text-accent-ink">/{c.shortcut}</span>
              <span className="ml-2 truncate text-muted-foreground">{c.content}</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border bg-background shadow-xs/5 transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/24">
        {replyTo && (
          <div className="mx-2.5 mt-2.5 flex items-center gap-3 rounded-lg bg-surface-light px-3 py-2">
            <Reply size={16} className="shrink-0 text-accent-ink" />
            <div className="min-w-0 flex-1 border-l-2 border-accent-strong pl-2 text-xs">
              <p className="font-semibold text-accent-ink">Respondiendo a {replyTo.direction === "OUTBOUND" ? "tu mensaje" : leadName}</p>
              <p className="truncate text-muted-foreground">{replyTo.body || replyTo.caption || `[${replyTo.messageType}]`}</p>
            </div>
            <Button type="button" variant="ghost" size="icon-xs" onClick={onCancelReply} aria-label="Cancelar respuesta citada"><X /></Button>
          </div>
        )}

        {attachment && (
          <div className="chat-disclosure-enter mx-2.5 mt-2.5 flex items-center gap-3 rounded-lg bg-surface-light p-2">
            {attachmentPreview && isImageMime(attachment.type) ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview blob
              <img src={attachmentPreview} alt={attachment.name} className="size-12 rounded-md object-cover" />
            ) : isAudioMime(attachment.type) ? (
              <FileAudio size={18} className="shrink-0 text-muted-foreground" />
            ) : isVideoMime(attachment.type) ? (
              <Video size={18} className="shrink-0 text-muted-foreground" />
            ) : (
              <FileText size={18} className="shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{attachment.name}</p>
              <p className="text-[11px] tabular-nums text-muted-foreground">{(attachment.size / 1024).toFixed(0)} KB</p>
            </div>
            <Button type="button" variant="ghost" size="icon-xs" onClick={onClearAttachment} disabled={sending} title="Quitar adjunto" aria-label="Quitar adjunto"><X /></Button>
          </div>
        )}

        {buttonsPanelOpen && (
          <div className="chat-disclosure-enter mx-2.5 mt-2.5 max-h-[min(40dvh,18rem)] space-y-2 overflow-y-auto rounded-lg bg-surface-light p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Botones de respuesta rápida ({interactiveButtons.length}/{MAX_BUTTONS})</span>
              <Button type="button" variant="ghost" size="icon-xs" onClick={toggleButtons} title="Cerrar y quitar botones" aria-label="Cerrar y quitar botones"><X /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Se enviarán con el mensaje. Hasta tres botones de 20 caracteres.</p>
            {interactiveButtons.map((title, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={title}
                  autoFocus={i === 0}
                  onChange={(e) => {
                    const next = [...interactiveButtons];
                    next[i] = e.target.value.slice(0, MAX_BUTTON_LENGTH);
                    onButtonsChange(next);
                  }}
                  maxLength={MAX_BUTTON_LENGTH}
                  aria-label={`Texto del botón ${i + 1}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      messageInputRef.current?.focus();
                    }
                  }}
                  placeholder={`Botón ${i + 1}`}
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => onButtonsChange(interactiveButtons.filter((_, idx) => idx !== i))} aria-label={`Quitar botón ${i + 1}`}><X /></Button>
              </div>
            ))}
            {interactiveButtons.length < MAX_BUTTONS && (
              <Button type="button" variant="outline" size="sm" onClick={() => onButtonsChange([...interactiveButtons, ""])}>
                <Plus /> Agregar botón
              </Button>
            )}
          </div>
        )}

        <textarea
          ref={messageInputRef}
          rows={1}
          value={newMessage}
          aria-label="Mensaje"
          onChange={(e) => { onMessageChange(e.target.value); onCannedIndexChange(0); }}
          onKeyDown={(e) => {
            if (cannedSuggestions.length > 0) {
              const max = cannedSuggestions.length;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                onCannedIndexChange((cannedIndex + 1) % max);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                onCannedIndexChange((cannedIndex - 1 + max) % max);
                return;
              }
              if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                // Con el dropdown abierto, Enter selecciona la sugerencia
                // resaltada en lugar de enviar el atajo a medias.
                e.preventDefault();
                onInsertCanned(cannedSuggestions[Math.min(cannedIndex, max - 1)].content);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e as unknown as React.FormEvent);
            }
          }}
          placeholder={
            interactiveButtons.length > 0
              ? "Escribe el mensaje que acompaña a los botones..."
              : attachment
                ? "Añadir comentario (opcional)..."
                : "Escribe un mensaje (usa /atajo para respuestas rápidas)"
          }
          className="scrollbar-thin block max-h-40 w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/72 disabled:opacity-60"
          disabled={sending}
        />

        <input ref={fileInputRef} type="file" onChange={onFileChosen} accept="image/*,audio/*,video/*,application/pdf,text/plain" className="hidden" />
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2 pt-1" role="toolbar" aria-label="Herramientas del mensaje">
          {supportsAttachments && (
            <Button type="button" variant="ghost" size="sm" onClick={onPickFile} disabled={sending || attachmentsDisabled} title={interactiveButtons.length > 0 ? "Quita los botones para adjuntar un archivo" : "Adjuntar archivo"}>
              <Paperclip className="text-accent-ink" /> <span className="hidden @xl:inline">Adjuntar</span>
            </Button>
          )}
          {supportsButtons && (
            <Button type="button" variant={buttonsPanelOpen ? "secondary" : "ghost"} size="sm" onClick={toggleButtons} disabled={sending || interactiveDisabled} aria-expanded={buttonsPanelOpen}
              title={interactiveDisabled ? "Quita el archivo adjunto para usar botones" : buttonsPanelOpen ? "Cerrar y quitar botones" : "Añadir botones de respuesta rápida"}>
              <ListChecks className="text-accent-ink" /> <span className="hidden @xl:inline">Botones</span>{interactiveButtons.length > 0 ? ` (${interactiveButtons.length})` : ""}
            </Button>
          )}
          {supportsSuggestions && <ReplySuggestionButton key={chatId} chatId={chatId} onInsert={insertSuggestion} />}
          {channel === "WHATSAPP" && <StickerPicker key={`stickers-${chatId}`} disabled={sending || !!attachment || interactiveButtons.length > 0} onSend={onSendSticker} />}
          <span className="ml-auto hidden text-[11px] text-muted-foreground @2xl:inline">Enter envía · Shift+Enter nueva línea</span>
          <Button type="submit" size="icon-sm" aria-label="Enviar mensaje" disabled={cannotSend} className="ml-auto @2xl:ml-2">
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
      </div>
    </form>
  );
}
