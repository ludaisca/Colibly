"use client";

import { useRef } from "react";
import { Send, Paperclip, X, FileAudio, Video, FileText, ListChecks, Plus, Reply } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
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
  const messageInputRef = useRef<HTMLInputElement>(null);
  const supportsAttachments = channel !== "WEBCHAT";
  const supportsButtons = channel === "WHATSAPP";
  const supportsSuggestions = channel === "WHATSAPP" || channel === "TELEGRAM";

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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 px-4 py-3 border-t border-border bg-surface shrink-0 relative">
      {replyTo && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2">
          <Reply size={16} className="shrink-0 text-accent-ink" />
          <div className="min-w-0 flex-1 border-l-2 border-accent-strong pl-2 text-xs">
            <p className="font-semibold text-accent-ink">Respondiendo a {replyTo.direction === "OUTBOUND" ? "tu mensaje" : leadName}</p>
            <p className="truncate text-muted-darker">{replyTo.body || replyTo.caption || `[${replyTo.messageType}]`}</p>
          </div>
          <button type="button" onClick={onCancelReply} className="rounded-lg p-1 text-muted-darker hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent" aria-label="Cancelar respuesta citada"><X size={16} /></button>
        </div>
      )}
      {cannedSuggestions.length > 0 && (
        <div className="chat-disclosure-enter absolute bottom-full left-4 right-4 mb-1.5 rounded-lg border border-border bg-surface shadow-lg overflow-hidden z-20">
          {cannedSuggestions.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onInsertCanned(c.content)}
              onMouseEnter={() => onCannedIndexChange(i)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-border last:border-b-0 ${
                i === cannedIndex ? "bg-surface-light" : "hover:bg-surface-light"
              }`}
            >
              <span className="font-semibold text-accent-ink">/{c.shortcut}</span>
              <span className="text-muted-darker ml-2 truncate">{c.content}</span>
            </button>
          ))}
        </div>
      )}

      {attachment && (
        <div className="chat-disclosure-enter flex items-center gap-3 rounded-lg border border-border bg-background p-2">
          {attachmentPreview && isImageMime(attachment.type) ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview blob
            <img src={attachmentPreview} alt={attachment.name} className="h-12 w-12 rounded object-cover animate-fade-in" />
          ) : isAudioMime(attachment.type) ? (
            <FileAudio size={18} className="text-muted-darker shrink-0" />
          ) : isVideoMime(attachment.type) ? (
            <Video size={18} className="text-muted-darker shrink-0" />
          ) : (
            <FileText size={18} className="text-muted-darker shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs truncate">{attachment.name}</p>
            <p className="text-[11px] text-muted-darker">{(attachment.size / 1024).toFixed(0)} KB</p>
          </div>
          <button
            type="button"
            onClick={onClearAttachment}
            className="text-muted-darker hover:text-danger transition-colors p-1 rounded-md hover:bg-surface-light"
            disabled={sending}
            title="Quitar adjunto"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {buttonsPanelOpen && (
        <div className="chat-disclosure-enter max-h-[min(40dvh,18rem)] space-y-2 overflow-y-auto rounded-xl border border-border bg-background p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-darker">
              Botones de respuesta rápida ({interactiveButtons.length}/{MAX_BUTTONS})
            </span>
            <button
              type="button"
              onClick={toggleButtons}
              className="text-muted-darker hover:text-danger transition-colors p-1 rounded-md hover:bg-surface-light"
              title="Cerrar y quitar botones"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-muted-darker">Se enviarán con el mensaje. Hasta tres botones de 20 caracteres.</p>
          {interactiveButtons.map((title, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
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
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm placeholder:text-muted-darker focus:outline-none focus:ring-2 focus:ring-accent-muted"
              />
              <button
                type="button"
                onClick={() => onButtonsChange(interactiveButtons.filter((_, idx) => idx !== i))}
                className="text-muted-darker hover:text-danger transition-colors p-1.5 rounded-md hover:bg-surface-light shrink-0"
                aria-label={`Quitar botón ${i + 1}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {interactiveButtons.length < MAX_BUTTONS && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => onButtonsChange([...interactiveButtons, ""])}
            >
              Agregar botón
            </Button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        onChange={onFileChosen}
        accept="image/*,audio/*,video/*,application/pdf,text/plain"
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-2" aria-label="Herramientas del mensaje">
        {supportsAttachments && (
          <button
            type="button"
            onClick={onPickFile}
            disabled={sending || attachmentsDisabled}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-surface-light disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent-strong"
            title={interactiveButtons.length > 0 ? "Quita los botones para adjuntar un archivo" : "Adjuntar archivo"}
          >
            <Paperclip size={16} className="text-accent-ink" />
            <span>Adjuntar</span>
          </button>
        )}
        {supportsButtons && (
          <button
            type="button"
            onClick={toggleButtons}
            disabled={sending || interactiveDisabled}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-surface-light disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent-strong data-[active=true]:border-accent-strong data-[active=true]:bg-accent-subtle"
            title={interactiveDisabled ? "Quita el archivo adjunto para usar botones" : buttonsPanelOpen ? "Cerrar y quitar botones" : "Añadir botones de respuesta rápida"}
            aria-expanded={buttonsPanelOpen}
            data-active={buttonsPanelOpen}
          >
            <ListChecks size={16} className="text-accent-ink" />
            <span>Botones{interactiveButtons.length > 0 ? ` (${interactiveButtons.length})` : ""}</span>
          </button>
        )}
        {supportsSuggestions && <ReplySuggestionButton key={chatId} chatId={chatId} onInsert={insertSuggestion} />}
        {channel === "WHATSAPP" && <StickerPicker key={`stickers-${chatId}`} disabled={sending || !!attachment || interactiveButtons.length > 0} onSend={onSendSticker} />}
      </div>
      <div className="flex items-end gap-2">
        <input
          ref={messageInputRef}
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
                : "Escribe un mensaje... (usa /atajo para respuestas rápidas)"
          }
          className="min-w-0 flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm placeholder:text-muted-darker focus:outline-none focus:ring-2 focus:ring-accent-muted transition-colors"
          disabled={sending}
        />
        <Button
          type="submit"
          aria-label="Enviar mensaje"
          icon={sending ? undefined : Send}
          size="md"
          className="px-3"
          disabled={
            (!newMessage.trim() && !attachment && interactiveButtons.length === 0) ||
            (interactiveButtons.length > 0 && (!newMessage.trim() || interactiveButtons.some((t) => !t.trim()))) ||
            sending
          }
        >
          {sending ? <Spinner /> : ""}
        </Button>
      </div>
    </form>
  );
}
