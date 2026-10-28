"use client";

import { useEffect, useRef } from "react";
import { Send, Paperclip, X, FileAudio, Video, FileText, ListChecks, Plus, Reply } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
import { isImageMime, isAudioMime, isVideoMime } from "@/lib/whatsapp/media-shared";
import { ReplySuggestionButton } from "./reply-suggestion-button";
import { RewriteButton } from "./rewrite-button";
import { StickerPicker } from "./sticker-picker";
import { displayMessageText, type CannedResponseItem, type Channel, type Message } from "./chat-shared";

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

  // "Enviar plantilla" (solo WhatsApp): opción secundaria con la ventana de
  // 24 h abierta; con la ventana cerrada el banner del chat la destaca.
  onOpenTemplates?: () => void;

  // WhatsApp rechazó el número (nombre para mostrar sin aprobar). El borrador
  // se puede escribir; nada sale hasta que Meta lo apruebe.
  sendBlockedReason?: string | null;
}

const MAX_BUTTONS = 3;
const MAX_BUTTON_LENGTH = 20;
const TOOL_BUTTON = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-darker hover:bg-surface-light hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent-strong";

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
  onOpenTemplates,
  interactiveDisabled = false,
  sendBlockedReason = null,
}: ChatComposerProps) {
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = messageInputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 128)}px`;
  }, [newMessage]);
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
            <p className="truncate text-muted-darker">{displayMessageText(replyTo.body) || replyTo.caption || `[${replyTo.messageType}]`}</p>
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
      <div className="flex items-end gap-1">
        <div className="flex min-w-0 items-center overflow-x-auto scrollbar-thin" aria-label="Herramientas del mensaje">
          {supportsAttachments && (
            <button
              type="button"
              onClick={onPickFile}
              disabled={sending || attachmentsDisabled || !!sendBlockedReason}
              className={TOOL_BUTTON}
              title={interactiveButtons.length > 0 ? "Quita los botones para adjuntar un archivo" : "Adjuntar"}
              aria-label="Adjuntar archivo"
            >
              <Paperclip size={18} />
            </button>
          )}
          {supportsButtons && (
            <button
              type="button"
              onClick={toggleButtons}
              disabled={sending || interactiveDisabled || !!sendBlockedReason}
              className={`${TOOL_BUTTON} ${buttonsPanelOpen ? "bg-accent-subtle text-accent-ink" : ""}`}
              title={interactiveDisabled ? "Quita el archivo adjunto para usar botones" : buttonsPanelOpen ? "Cerrar botones" : "Botones de respuesta"}
              aria-label="Botones de respuesta"
              aria-expanded={buttonsPanelOpen}
            >
              <ListChecks size={18} />
            </button>
          )}
          {channel === "WHATSAPP" && onOpenTemplates && (
            <button
              type="button"
              onClick={onOpenTemplates}
              disabled={sending || !!sendBlockedReason}
              className={TOOL_BUTTON}
              title={sendBlockedReason ?? "Plantilla"}
              aria-label="Enviar plantilla"
            >
              <FileText size={18} />
            </button>
          )}
          {supportsSuggestions && <ReplySuggestionButton key={chatId} chatId={chatId} onInsert={insertSuggestion} />}
          <RewriteButton key={`rewrite-${chatId}`} chatId={chatId} draft={newMessage} onInsert={insertSuggestion} />
          {channel === "WHATSAPP" && <StickerPicker key={`stickers-${chatId}`} disabled={sending || !!attachment || interactiveButtons.length > 0 || !!sendBlockedReason} onSend={onSendSticker} />}
        </div>
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
            sendBlockedReason
              ? "El envío se habilita cuando WhatsApp apruebe el nombre."
              : interactiveButtons.length > 0
              ? "Mensaje que acompaña a los botones"
              : attachment
                ? "Comentario (opcional)"
                : "Escribe un mensaje"
          }
          className="max-h-32 min-h-10 min-w-[8rem] flex-1 resize-none rounded-[12px] border border-border bg-background px-3 py-2.5 text-sm leading-5 text-foreground placeholder:text-muted-darker focus:outline-none focus:ring-2 focus:ring-accent-muted"
          disabled={sending}
        />
        <Button
          type="submit"
          aria-label="Enviar mensaje"
          icon={sending ? undefined : Send}
          size="md"
          className="shrink-0 px-3"
          disabled={
            !!sendBlockedReason ||
            (!newMessage.trim() && !attachment && interactiveButtons.length === 0) ||
            (interactiveButtons.length > 0 && (!newMessage.trim() || interactiveButtons.some((t) => !t.trim()))) ||
            sending
          }
          title={sendBlockedReason ?? "Enviar"}
        >
          {sending ? <Spinner /> : ""}
        </Button>
      </div>
    </form>
  );
}
