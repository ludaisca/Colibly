"use client";

import { Tooltip } from "@/app/components/ui/tooltip";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FormatToolbar } from "@/app/components/ui/format-toolbar";
import { Send, Paperclip, X, FileAudio, Video, FileText, Plus, Reply, Mic, Check, Image as ImageIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { isImageMime, isAudioMime, isVideoMime, mediaEndpointFor } from "@/lib/whatsapp/media-shared";
import { ChatAiMenu, ChatMoreMenu } from "./chat-composer-tools";
import { messagePreview, type CannedResponseItem, type Channel, type Message } from "./chat-shared";
import { Input } from "@/app/components/ui/input";

// Input + adjuntos + respuestas rápidas — extraído de chat-workspace.tsx sin
// tocar el envío optimista (vive en el orquestador, que sigue siendo dueño de
// `newMessage`/`attachment`/`performSend`; este panel solo dispara callbacks).

interface ChatComposerProps {
  /** Firma personal activa (F6): se muestra como aviso mientras se escribe texto. */
  signature?: string | null;
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
  /** Un archivo elegido fuera del input (p. ej. una nota de voz grabada). */
  onFileSelected: (file: File) => void;
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
  // "Interactive messages in every channel" en docs/arquitectura/integraciones.md.
  interactiveButtons: string[];
  onButtonsChange: (buttons: string[]) => void;
  buttonsPanelOpen: boolean;
  onToggleButtonsPanel: () => void;
  interactiveDisabled?: boolean;

  // "Enviar plantilla" (solo WhatsApp): opción secundaria con la ventana de
  // 24 h abierta; con la ventana cerrada el banner del chat la destaca.
  onOpenTemplates?: () => void;
}

const MAX_BUTTONS = 3;
const MAX_BUTTON_LENGTH = 20;
const TOOL_BUTTON = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-darker hover:bg-surface-light hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent-strong";

export function ChatComposer({
  signature,
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
  onFileSelected,
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
}: ChatComposerProps) {
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const { error: toastError } = useToast();
  // Client-only: en SSR no existe MediaRecorder y el snapshot del servidor es
  // false para que la hidratación coincida.
  const canRecord = useSyncExternalStore(
    () => () => {},
    () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    () => false
  );
  const [recording, setRecording] = useState<{ seconds: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const discardRef = useRef(false);

  useEffect(() => {
    const field = messageInputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 128)}px`;
  }, [newMessage]);

  // Si se desmonta el chat grabando, se suelta el micrófono y no queda el
  // indicador encendido en el navegador.
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        discardRef.current = true;
        recorderRef.current.stop();
      }
    };
  }, []);

  const RECORD_MAX_SECONDS = 5 * 60;

  function cleanupRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startedAtRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    if (recording || sending || attachment || interactiveButtons.length > 0) return;
    const candidates = channel === "WHATSAPP"
      // WhatsApp acepta OGG/OPUS y MP4/AAC; WebM no. MP4 es lo que graba
      // Chrome/Edge hoy (OGG lo soporta Firefox).
      ? ["audio/ogg;codecs=opus", "audio/mp4"]
      : ["audio/ogg;codecs=opus", "audio/mp4", "audio/webm;codecs=opus"];
    const mime = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mime) {
      toastError("Tu navegador no puede grabar audio en un formato compatible con este canal.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      discardRef.current = false;
      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const chunks = chunksRef.current;
        const discard = discardRef.current;
        chunksRef.current = [];
        discardRef.current = false;
        recorderRef.current = null;
        cleanupRecording();
        setRecording(null);
        if (discard) return;
        const baseMime = mime.split(";")[0].trim();
        const blob = new Blob(chunks, { type: baseMime });
        if (blob.size === 0) {
          toastError("La grabación quedó vacía.");
          return;
        }
        const ext = baseMime === "audio/ogg" ? "ogg" : baseMime === "audio/mp4" ? "m4a" : "webm";
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        onFileSelected(new File([blob], `audio-${stamp}.${ext}`, { type: baseMime }));
      };
      recorder.start(500);
      startedAtRef.current = Date.now();
      setRecording({ seconds: 0 });
      timerRef.current = window.setInterval(() => {
        const started = startedAtRef.current;
        if (!started) return;
        const seconds = Math.floor((Date.now() - started) / 1000);
        setRecording({ seconds });
        if (seconds >= RECORD_MAX_SECONDS) finishRecording(false);
      }, 500);
    } catch {
      cleanupRecording();
      toastError("No pudimos acceder al micrófono. Revisa los permisos del navegador.");
    }
  }

  function finishRecording(discard: boolean) {
    const recorder = recorderRef.current;
    discardRef.current = discard;
    if (!recorder) {
      cleanupRecording();
      setRecording(null);
      return;
    }
    if (recorder.state !== "inactive") recorder.stop();
    else {
      cleanupRecording();
      setRecording(null);
    }
  }

  function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }
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

  const replyThumb = replyTo?.mediaUrl && (replyTo.messageType === "image" || replyTo.messageType === "sticker")
    ? mediaEndpointFor(replyTo.id, channel)
    : null;
  const replyIcon = !replyTo ? <Reply size={16} />
    : replyTo.messageType === "document" ? <FileText size={16} />
    : replyTo.messageType === "audio" ? <FileAudio size={16} />
    : replyTo.messageType === "video" ? <Video size={16} />
    : replyTo.messageType === "image" || replyTo.messageType === "sticker" ? <ImageIcon size={16} />
    : <Reply size={16} />;

  return (
    <form onSubmit={onSubmit} className="relative flex shrink-0 flex-col gap-1.5 border-t border-border bg-surface px-3 py-1.5">
      {signature && newMessage.trim() && !attachment && (
        <p className="truncate px-1 text-micro text-muted-darker" title={signature}>
          Se agregará tu firma: <span className="text-foreground">{signature}</span>
        </p>
      )}
      {replyTo && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2">
          {replyThumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- proxied media, runtime URL
            <img src={replyThumb} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface text-accent-ink">{replyIcon}</span>
          )}
          <div className="min-w-0 flex-1 border-l-2 border-accent-strong pl-2 text-xs">
            <p className="font-semibold text-accent-ink">Respondiendo a {replyTo.direction === "OUTBOUND" ? "tu mensaje" : leadName}</p>
            <p className="truncate text-muted-darker">{messagePreview(replyTo)}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" icon={X} onClick={onCancelReply} aria-label="Cancelar respuesta citada" />
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
            <img src={attachmentPreview} alt={attachment.name} width={48} height={48} className="h-12 w-12 rounded object-cover animate-fade-in" />
          ) : isAudioMime(attachment.type) ? (
            attachmentPreview ? (
              <audio controls src={attachmentPreview} className="h-10 w-44 shrink-0" />
            ) : (
              <FileAudio size={18} className="text-muted-darker shrink-0" />
            )
          ) : isVideoMime(attachment.type) ? (
            <Video size={18} className="text-muted-darker shrink-0" />
          ) : (
            <FileText size={18} className="text-muted-darker shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs truncate">{attachment.name}</p>
            <p className="text-micro text-muted-darker">{(attachment.size / 1024).toFixed(0)} KB</p>
          </div>
          <Tooltip label="Quitar adjunto"><button aria-label="Quitar adjunto"
            type="button"
            onClick={onClearAttachment}
            className="text-muted-darker hover:text-danger transition-colors p-1 rounded-md hover:bg-surface-light"
            disabled={sending}
          >
            <X size={16} />
          </button></Tooltip>
        </div>
      )}

      {buttonsPanelOpen && (
        <div className="chat-disclosure-enter max-h-[min(40dvh,18rem)] space-y-2 overflow-y-auto rounded-xl border border-border bg-background p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-darker">
              Botones de respuesta rápida ({interactiveButtons.length}/{MAX_BUTTONS})
            </span>
            <Tooltip label="Cerrar y quitar botones"><button aria-label="Cerrar y quitar botones"
              type="button"
              onClick={toggleButtons}
              className="text-muted-darker hover:text-danger transition-colors p-1 rounded-md hover:bg-surface-light"
            >
              <X size={14} />
            </button></Tooltip>
          </div>
          <p className="text-xs text-muted-darker">Se enviarán con el mensaje. Hasta tres botones de 20 caracteres.</p>
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
                className="min-w-0 flex-1"
                inputClassName="py-1.5"
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
      {recording ? (
        <div className="flex items-center gap-3 rounded-2xl border border-danger-border bg-danger-bg px-3 py-2" role="status" aria-live="polite">
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-danger" />
          <span className="tabular-nums text-sm font-semibold text-foreground">{formatDuration(recording.seconds)}</span>
          <span className="flex-1 text-xs text-muted-darker">Grabando audio…</span>
          <Tooltip label="Cancelar"><button type="button" onClick={() => finishRecording(true)} className={TOOL_BUTTON} aria-label="Cancelar grabación">
            <X size={18} />
          </button></Tooltip>
          <Button type="button" size="sm" icon={Check} onClick={() => finishRecording(false)}>Adjuntar</Button>
        </div>
      ) : (
      <div className="flex items-end gap-1">
        <div className="flex min-w-0 items-center" aria-label="Herramientas del mensaje">
          {supportsAttachments && (
            <Tooltip label={interactiveButtons.length > 0 ? "Quita los botones para adjuntar un archivo" : "Adjuntar"}><button
              type="button"
              onClick={onPickFile}
              disabled={sending || attachmentsDisabled}
              className={TOOL_BUTTON}
              aria-label="Adjuntar archivo"
            >
              <Paperclip size={18} />
            </button></Tooltip>
          )}
          <ChatAiMenu
            chatId={chatId}
            draft={newMessage}
            supportsSuggestions={supportsSuggestions}
            disabled={sending}
            onInsert={insertSuggestion}
          />
          {(channel === "WHATSAPP" || !!onOpenTemplates) && (
            <ChatMoreMenu
              channel={channel}
              disabled={sending}
              supportsButtons={supportsButtons}
              buttonsPanelOpen={buttonsPanelOpen}
              buttonsDisabled={interactiveDisabled}
              onToggleButtons={toggleButtons}
              onOpenTemplates={onOpenTemplates}
              onSendSticker={onSendSticker}
              stickersDisabled={sending || !!attachment || interactiveButtons.length > 0}
            />
          )}
        </div>
        <div className="relative flex min-w-[8rem] flex-1">
        {/* Formato de WhatsApp (*negrita*…) sobre lo seleccionado; los otros
            canales mandan texto plano, así que ahí no se ofrece. */}
        {channel === "WHATSAPP" && <FormatToolbar textareaRef={messageInputRef} value={newMessage} onChange={onMessageChange} />}
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
            interactiveButtons.length > 0
              ? "Mensaje que acompaña a los botones"
              : attachment
                ? "Comentario (opcional)"
                : "Escribe un mensaje"
          }
          data-focus-ring=""
          className="max-h-32 min-h-9 w-full resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm leading-5 text-foreground placeholder:text-muted-darker focus:outline-none focus:ring-2 focus:ring-accent-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          disabled={sending}
        />
        </div>
        {canRecord && !attachment && interactiveButtons.length === 0 && (
          <Tooltip label="Grabar audio"><button
            type="button"
            onClick={() => void startRecording()}
            disabled={sending}
            className={TOOL_BUTTON}
            aria-label="Grabar audio"
          >
            <Mic size={18} />
          </button></Tooltip>
        )}
        <Button
          type="submit"
          aria-label="Enviar mensaje"
          icon={sending ? undefined : Send}
          size="sm"
          className="shrink-0 px-3"
          disabled={
            (!newMessage.trim() && !attachment && interactiveButtons.length === 0) ||
            (interactiveButtons.length > 0 && (!newMessage.trim() || interactiveButtons.some((t) => !t.trim()))) ||
            sending
          }
          title="Enviar"
        >
          {sending ? <Spinner /> : ""}
        </Button>
      </div>
      )}
    </form>
  );
}
