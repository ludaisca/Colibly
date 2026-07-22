"use client";

import { Send, Paperclip, X, FileAudio, Video, FileText } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
import { isImageMime, isAudioMime, isVideoMime } from "@/lib/whatsapp/media-shared";
import type { CannedResponseItem } from "./chat-shared";

// Input + adjuntos + respuestas rápidas — extraído de chat-workspace.tsx sin
// tocar el envío optimista (vive en el orquestador, que sigue siendo dueño de
// `newMessage`/`attachment`/`performSend`; este panel solo dispara callbacks).

interface ChatComposerProps {
  newMessage: string;
  onMessageChange: (value: string) => void;
  sending: boolean;
  onSubmit: (e: React.FormEvent) => void;

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

  // Telegram no soporta adjuntos todavía (ver plan de canales adicionales) —
  // en vez de dejar que el intento falle en el servidor, el clip se
  // deshabilita directamente para ese canal.
  attachmentsDisabled?: boolean;
}

export function ChatComposer({
  newMessage,
  onMessageChange,
  sending,
  onSubmit,
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
}: ChatComposerProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 px-4 py-3 border-t border-border bg-surface shrink-0 relative">
      {cannedSuggestions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1.5 rounded-lg border border-border bg-surface shadow-lg overflow-hidden z-20">
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
              <span className="font-mono text-accent">/{c.shortcut}</span>
              <span className="text-muted-darker ml-2 truncate">{c.content}</span>
            </button>
          ))}
        </div>
      )}

      {attachment && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-2">
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

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          onChange={onFileChosen}
          accept="image/*,audio/*,video/*,application/pdf,text/plain"
          className="hidden"
        />
        <button
          type="button"
          onClick={onPickFile}
          disabled={sending || attachmentsDisabled}
          className="text-accent hover:text-accent/80 transition-colors p-2.5 rounded-lg border border-accent/30 bg-accent/10 hover:bg-accent/15 disabled:opacity-50 shrink-0 cursor-pointer"
          title={attachmentsDisabled ? "Los adjuntos no están disponibles para Telegram todavía" : "Adjuntar medio"}
          aria-label="Adjuntar medio"
        >
          <Paperclip size={20} />
        </button>
        <input
          value={newMessage}
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
          placeholder={attachment ? "Añadir comentario (opcional)..." : "Escribe un mensaje... (usa /atajo para respuestas rápidas)"}
          className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm placeholder:text-muted-darker focus:outline-none focus:ring-2 focus:ring-accent/40 transition-colors"
          disabled={sending}
        />
        <Button
          type="submit"
          icon={sending ? undefined : Send}
          size="sm"
          disabled={(!newMessage.trim() && !attachment) || sending}
        >
          {sending ? <Spinner /> : ""}
        </Button>
      </div>
    </form>
  );
}
