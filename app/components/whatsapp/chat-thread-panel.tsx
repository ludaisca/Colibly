"use client";

import { Tooltip } from "@/app/components/ui/tooltip";
import { displayName } from "@/lib/chats/display-name";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  MapPin,
  MessageSquare,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  RotateCw,
  FileAudio,
  Video,
  FileText,
  Image as ImageIcon,
  Download,
  Maximize2,
  CornerUpLeft,
  ArrowDown,
  Eye,
  FileWarning,
} from "lucide-react";
import { ChatMessageActions, MessageContextMenu } from "./chat-message-actions";
import { WhatsAppText } from "./whatsapp-text";
import { AudioTranscript } from "./audio-transcript";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
import { EmptyState } from "@/app/components/ui/empty-state";
import { Modal } from "@/app/components/ui/modal";
import { useToast } from "@/app/components/ui/toast";
import { ChatConversationHeader } from "./chat-conversation-header";
import { ChatBubblesSkeleton } from "@/app/components/whatsapp/chat-skeletons";
import { mediaEndpointFor, isPdfMime, type MediaChannel } from "@/lib/whatsapp/media-shared";
import {
  messagePreview,
  formatBubbleTime,
  formatDayDivider,
  formatBytes,
  type ChatItem,
  type ChatPriority,
  type ChatStatus,
  type Message,
  type AgentReaction,
  type PreviewMedia,
  mapUrlFor,
} from "./chat-shared";

// Header del hilo + área de mensajes — extraído de chat-workspace.tsx sin
// tocar el merge por id del polling ni el scroll (ambos se quedan en el
// orquestador, que sigue siendo dueño de `messages`/los refs de scroll).

const MESSAGE_STATUS_LABEL: Record<string, string> = {
  sending: "Enviando", failed: "No enviado", sent: "Enviado",
  delivered: "Entregado", read: "Leído",
};

// Archivo del cliente que Meta no pudo entregar (más de 100 MB): lib/whatsapp/media-too-large.ts.
// El texto ya dice si se puede ver en el teléfono conectado.
function MediaTooLargeNotice({ msg }: { msg: Message }) {
  return (
    <div className="flex items-start gap-2" role="note">
      <FileWarning size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">Archivo demasiado grande</p>
        <p className="mt-0.5 break-words text-muted-strong">{msg.body}</p>
      </div>
    </div>
  );
}

function MediaContent({ msg, channel, onPreview }: { msg: Message; channel: MediaChannel; onPreview: (media: PreviewMedia) => void }) {
  const mediaSrc = msg.localPreviewUrl ?? (msg.mediaUrl ? mediaEndpointFor(msg.id, channel) : null);

  if (msg.messageType === "image" || msg.messageType === "sticker") {
    if (!mediaSrc) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-darker">
          <ImageIcon size={14} />
          <span>Imagen recibida</span>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onPreview({ type: "image", src: mediaSrc, filename: msg.filename, mimeType: msg.mimeType })}
        className="block cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied media, runtime URL */}
        <img
          src={mediaSrc}
          alt={msg.caption ?? "imagen"}
          className={msg.messageType === "sticker" ? "h-36 w-36 max-w-full object-contain sm:h-44 sm:w-44" : "max-h-[320px] max-w-full rounded-xl object-cover"}
          loading="lazy"
        />
      </button>
    );
  }

  if (msg.messageType === "audio") {
    if (!mediaSrc) {
      return (
        <div className="max-w-[260px]">
          <div className="flex items-center gap-2 text-xs text-muted-darker">
            <FileAudio size={14} />
            <span>Audio recibido</span>
          </div>
          {/* Sin reproductor (canal sin proxy de medios) la transcripción sigue sirviendo. */}
          {msg.mediaUrl && !msg.id.startsWith("temp-") && <AudioTranscript messageId={msg.id} initial={msg.transcript ?? null} />}
        </div>
      );
    }
    return (
      <div className="w-[260px] max-w-full">
        <div className="flex items-center gap-1.5">
          <audio controls src={mediaSrc} className="h-10 min-w-0 flex-1" />
          <Tooltip label="Descargar audio"><a aria-label="Descargar audio"
            href={mediaSrc}
            download={msg.filename ?? "audio.ogg"}
            className="text-muted-darker hover:text-foreground shrink-0"
          >
            <Download size={14} />
          </a></Tooltip>
        </div>
        {/* Los temp-… (envío optimista) aún no existen en la base. */}
        {!msg.id.startsWith("temp-") && <AudioTranscript messageId={msg.id} initial={msg.transcript ?? null} />}
      </div>
    );
  }

  if (msg.messageType === "video") {
    if (!mediaSrc) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-darker">
          <Video size={14} />
          <span>Video recibido</span>
        </div>
      );
    }
    return (
      <div className="relative group max-w-full">
        <video controls src={mediaSrc} className="max-h-[320px] max-w-full rounded-xl" />
        <Tooltip label="Ver en grande"><button aria-label="Ver en grande"
          type="button"
          onClick={() => onPreview({ type: "video", src: mediaSrc, filename: msg.filename, mimeType: msg.mimeType })}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70"
        >
          <Maximize2 size={14} />
        </button></Tooltip>
      </div>
    );
  }

  if (msg.messageType === "document") {
    if (!mediaSrc) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-darker">
          <FileText size={14} />
          <span>{msg.filename ?? "Documento recibido"}</span>
        </div>
      );
    }
    const pdf = isPdfMime(msg.mimeType) || /\.pdf$/i.test(msg.filename ?? "");
    return (
      <div className="w-[260px] max-w-full space-y-2">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-accent-ink">
            <FileText size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground" title={msg.filename ?? undefined}>
              {msg.filename ?? "Documento"}
            </p>
            <p className="text-micro text-muted-darker">
              {pdf ? "PDF" : "Documento"}{msg.bytesSize ? ` · ${formatBytes(msg.bytesSize)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pdf && (
            <a
              href={mediaSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface px-2.5 text-xs font-medium text-accent-ink hover:bg-accent-subtle"
            >
              <Eye size={14} /> Ver
            </a>
          )}
          <a
            href={mediaSrc}
            download={msg.filename ?? undefined}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface px-2.5 text-xs font-medium text-foreground hover:bg-surface-light"
          >
            <Download size={14} /> Descargar
          </a>
        </div>
      </div>
    );
  }

  return null;
}

// Ubicación compartida por el cliente. Las coordenadas llegan desde el
// 2026-11-04 (WAMessage.content); las anteriores solo guardaron "[location]".
function LocationContent({ msg }: { msg: Message }) {
  const location = msg.content?.location;
  const place = [location?.name, location?.address].filter(Boolean).join(" · ");
  return (
    <div className="w-[260px] max-w-full space-y-2">
      <div className="flex items-start gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-accent-ink">
          <MapPin size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={place || undefined}>{place || "Ubicación compartida"}</p>
          <p className="font-mono text-micro tabular-nums text-muted-darker">
            {location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : "Sin coordenadas (mensaje anterior al 4 nov 2026)"}
          </p>
        </div>
      </div>
      {location && (
        <a
          href={mapUrlFor(location)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface px-2.5 text-xs font-medium text-accent-ink hover:bg-accent-subtle"
        >
          <MapPin size={14} aria-hidden /> Abrir en el mapa
        </a>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  channel,
  onPreview,
  onRetry,
  onReply,
  onReaction,
  canReply,
  canQuote,
  canReact,
  leadName,
  reduceMotion,
  onJumpToMessage,
}: {
  msg: Message;
  channel: MediaChannel;
  onPreview: (media: PreviewMedia) => void;
  onRetry?: (msg: Message) => void;
  onReply?: (msg: Message) => void;
  onReaction: (id: string, reaction: AgentReaction) => void;
  canReply: boolean;
  canQuote: boolean;
  canReact: boolean;
  leadName: string;
  reduceMotion: boolean;
  onJumpToMessage: (id: string) => void;
}) {
  const isInbound = msg.direction === "INBOUND";
  const hasMedia = msg.messageType !== "text" && (msg.mediaUrl || msg.mediaId || msg.localPreviewUrl);
  const caption = msg.caption ?? (hasMedia && msg.body && msg.body !== `[${msg.messageType}]` ? msg.body : null);
  const isFailed = msg.status === "failed";
  const buttons = msg.messageType === "interactive" ? msg.interactivePayload?.buttons : undefined;
  const latestReaction = msg.agentReactions?.[0];
  const reactionPending = latestReaction && ["pending", "accepted"].includes(latestReaction.status);
  const ownEmoji = reactionPending ? latestReaction.emoji : msg.agentReactionEmoji;
  const reactionFailed = latestReaction?.status === "failed";
  const hasReaction = Boolean(msg.reactionEmoji || ownEmoji || reactionPending || reactionFailed);
  // Solo imagen/video sin caption usan la hora superpuesta sobre el medio.
  // Audio (controles nativos) y documentos (tarjeta) llevan la hora debajo;
  // si no, el pill negro de la hora aparecía encima del PDF.
  const mediaOnly =
    hasMedia &&
    (msg.messageType === "image" || msg.messageType === "video") &&
    !caption &&
    !(buttons && buttons.length > 0) &&
    !msg.replyToWamid &&
    !msg.isFromComment &&
    !isFailed;
  const quoted = msg.replyTo;
  const quotedThumb = quoted?.mediaUrl && (quoted.messageType === "image" || quoted.messageType === "sticker")
    ? mediaEndpointFor(quoted.id, channel)
    : null;
  const quotedIcon = quoted?.messageType === "document" ? <FileText size={16} />
    : quoted?.messageType === "audio" ? <FileAudio size={16} />
    : quoted?.messageType === "video" ? <Video size={16} />
    : quoted?.messageType === "image" || quoted?.messageType === "sticker" ? <ImageIcon size={16} />
    : null;

  const metaRow = (overlay: boolean) => (
    <div className={`flex items-center justify-end gap-1 ${overlay ? "text-white/90" : "text-muted-strong"}`}>
      {/* Una plantilla no se reintenta como texto libre: se reenvía desde "Enviar plantilla". */}
      {isFailed && msg.messageType !== "template" && (
        <button
          type="button"
          onClick={() => onRetry?.(msg)}
          className="mr-1 flex items-center gap-1 text-micro font-medium text-danger hover:underline"
        >
          <RotateCw size={10} /> Reintentar
        </button>
      )}
      <span className="text-micro">{formatBubbleTime(msg.timestamp)}</span>
      {!isInbound && msg.status && (
        <AnimatePresence initial={false} mode="wait">
          <motion.span key={msg.status} className="text-micro" role="img" aria-label={MESSAGE_STATUS_LABEL[msg.status] ?? msg.status}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.8 }}
            transition={{ duration: reduceMotion ? 0 : 0.12 }}>
            {msg.status === "sending" && <Clock size={11} />}
            {msg.status === "failed" && <AlertCircle size={11} className="text-danger" />}
            {msg.status === "sent" && <Check size={11} />}
            {msg.status === "delivered" && <CheckCheck size={11} />}
            {msg.status === "read" && <CheckCheck size={11} className={overlay ? "text-white" : "text-info"} />}
          </motion.span>
        </AnimatePresence>
      )}
    </div>
  );

  return (
    <div className={`group flex items-end gap-1.5 ${isInbound ? "justify-start" : "justify-end"} ${hasReaction ? "mb-3" : ""}`}>
      {!isInbound && canReply && <ChatMessageActions message={msg} onReply={canQuote ? onReply : undefined} onReaction={onReaction} canReact={canReact} />}
      <MessageContextMenu message={msg} onReply={canReply && canQuote ? onReply : undefined} onReaction={onReaction} canReact={canReply && canReact}>
      <div
        className={`relative max-w-[75%] text-sm leading-[1.4] transition-opacity duration-base lg:max-w-[65%] ${
          mediaOnly ? "p-1" : "px-3 py-2"
        } ${
          msg.messageType === "sticker" ? "rounded-xl bg-transparent text-foreground" : msg.messageType === "media_too_large"
            ? "rounded-2xl border border-dashed border-warning-border bg-warning-bg text-foreground"
            : isInbound
            ? "rounded-2xl border border-border bg-bubble-in text-foreground shadow-sm"
            : "rounded-2xl bg-bubble-out text-foreground shadow-sm"
        } ${msg.status === "sending" ? "opacity-70" : ""} ${isFailed ? "opacity-90 ring-1 ring-danger" : ""}`}
      >
        {msg.isFromComment && (
          <div className={`mb-1 flex items-center gap-1 text-micro font-medium ${isInbound ? "text-muted-darker" : "text-foreground/65"}`}>
            <MessageSquare size={10} />
            <span>Desde un comentario</span>
          </div>
        )}
        {msg.replyToWamid && (
          <Tooltip label="Ir al mensaje citado"><button
            type="button"
            onClick={() => quoted && onJumpToMessage(quoted.id)}
            className="mb-2 flex w-full max-w-full items-center gap-2 rounded-lg border-l-2 border-accent-strong bg-background/50 px-2 py-1.5 text-left text-xs transition-colors hover:bg-background/75 focus-visible:outline-2 focus-visible:outline-accent-strong"
          >
            {quotedThumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- proxied media, runtime URL
              <img src={quotedThumb} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
            ) : quotedIcon ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface text-muted-darker">{quotedIcon}</span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-accent-ink">{quoted?.direction === "OUTBOUND" ? "Tú" : quoted?.direction === "INBOUND" ? leadName : "Mensaje citado"}</span>
              <span className="block truncate text-muted-darker">{quoted ? messagePreview(quoted) : "Mensaje anterior"}</span>
            </span>
          </button></Tooltip>
        )}
        {hasMedia && (
          <div className={`${mediaOnly ? "" : "mb-1"} space-y-1`}>
            <MediaContent msg={msg} channel={channel} onPreview={onPreview} />
            {caption && <p className="whitespace-pre-wrap break-words">{channel === "WHATSAPP" ? <WhatsAppText text={caption} /> : caption}</p>}
          </div>
        )}
        {msg.messageType === "location" && <LocationContent msg={msg} />}
        {msg.messageType === "media_too_large" && <MediaTooLargeNotice msg={msg} />}
        {!hasMedia && msg.messageType !== "location" && msg.messageType !== "media_too_large" && msg.body && msg.body !== "[interactive]" && (
          <p className="whitespace-pre-wrap break-words">{channel === "WHATSAPP" ? <WhatsAppText text={msg.body} /> : msg.body}</p>
        )}
        {!hasMedia && msg.body === "[interactive]" && !(buttons && buttons.length > 0) && "Mensaje con botones"}
        {hasMedia && !caption && !msg.body && <span className="sr-only">[{msg.messageType}]</span>}
        {buttons && buttons.length > 0 && (
          // Un mensaje interactivo siempre es OUTBOUND (lo arma el agente), y
          // esta burbuja ya es bg-accent-muted/text-foreground (ver arriba) — por
          // eso el divisor usa foreground con opacidad, que funciona en ambos temas.
          <div className="mt-2 pt-2 border-t border-foreground/20 space-y-1">
            {buttons.map((b) => (
              <div key={b.id} className="flex items-center justify-center gap-1.5 text-xs py-1">
                <CornerUpLeft size={12} />
                <span>{b.title}</span>
              </div>
            ))}
          </div>
        )}
        {isFailed && msg.errorMessage && (
          <p className="mt-1 text-xs text-danger" role="note">{msg.errorMessage}</p>
        )}
        {mediaOnly ? (
          <div className={`pointer-events-none absolute z-10 rounded-md bg-black/55 px-1.5 py-0.5 backdrop-blur-[2px] ${msg.messageType === "video" ? "left-2 top-2" : "bottom-2 right-2"}`}>
            {metaRow(true)}
          </div>
        ) : (
          <div className="mt-1">{metaRow(false)}</div>
        )}
        {hasReaction && (
          <div className={`absolute -bottom-3 z-20 flex items-center gap-1 ${isInbound ? "left-2" : "right-2"}`} aria-live="polite">
            {msg.reactionEmoji && (
              <span
                className="rounded-full border border-border bg-surface px-1.5 py-0.5 text-sm leading-none shadow-sm"
                aria-label={`${leadName} reaccionó con ${msg.reactionEmoji}`}
                title={`Reacción de ${leadName}`}
              >
                {msg.reactionEmoji}
              </span>
            )}
            {(ownEmoji || reactionPending) && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-0.5 text-sm leading-none shadow-sm"
                title={reactionPending ? "Reacción enviada a WhatsApp; pendiente de confirmación" : "Reacción del equipo"}
                aria-label={reactionPending ? "Reacción del equipo pendiente de confirmación" : "Reacción del equipo"}
              >
                {ownEmoji || "…"}
                {reactionPending && <Clock size={10} className="text-muted-darker" />}
              </span>
            )}
            {reactionFailed && (
              <span className="rounded-full border border-danger-border bg-surface p-1 text-danger shadow-sm" title={latestReaction.error ?? "WhatsApp rechazó la reacción"} aria-label="No se pudo actualizar la reacción">
                <AlertCircle size={12} />
              </span>
            )}
          </div>
        )}
      </div>
      </MessageContextMenu>
      {isInbound && canReply && <ChatMessageActions message={msg} onReply={canQuote ? onReply : undefined} onReaction={onReaction} canReact={canReact} />}
    </div>
  );
}

export function MediaPreviewModal({ media, onClose }: { media: PreviewMedia | null; onClose: () => void }) {
  return (
    <Modal
      open={!!media}
      onClose={onClose}
      size="lg"
      title={media?.filename ?? (media?.type === "image" ? "Imagen" : "Video")}
      footer={
        media && (
          <Button
            href={media.src}
            external
            icon={Download}
            variant="secondary"
            {...{ download: media.filename ?? "" }}
          >
            Descargar
          </Button>
        )
      }
    >
      {media?.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- proxied media, runtime URL
        <img src={media.src} alt={media.filename ?? "imagen"} className="max-h-[70vh] w-auto mx-auto rounded-lg" />
      ) : media ? (
        <video src={media.src} controls autoPlay className="max-h-[70vh] w-full rounded-lg" />
      ) : null}
    </Modal>
  );
}

interface ChatThreadPanelProps {
  /** Mensaje al que saltar e iluminar (búsqueda "En mensajes"). */
  focusMessageId?: string | null;
  onFocusHandled?: () => void;
  selectedChat: ChatItem;
  messages: Message[];
  typingUsers: Array<{ id: string; name: string | null }>;
  loadingMessages: boolean;
  hasOlderMessages: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onCloseChat: () => void;
  onOpenContactDrawer: () => void;
  onStatusChange: (status: ChatStatus) => void | Promise<void>;
  onAssigned: (assignee: { id: string; name: string | null } | null) => void;
  onPriorityChange: (priority: ChatPriority) => void;
  onSnoozedChange: (until: string | null) => void;
  onMacroApplied?: () => void;
  onPreview: (media: PreviewMedia) => void;
  onRetry: (msg: Message) => void;
  onReply: (msg: Message) => void;
  canQuote: boolean;
  canReact: boolean;
  onReaction: (id: string, reaction: AgentReaction) => void;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatThreadPanel({
  selectedChat,
  messages,
  typingUsers,
  loadingMessages,
  hasOlderMessages,
  loadingOlder,
  onLoadOlder,
  onCloseChat,
  onOpenContactDrawer,
  onStatusChange,
  onAssigned,
  onPriorityChange,
  onSnoozedChange,
  onMacroApplied,
  onPreview,
  onRetry,
  onReply,
  canQuote,
  canReact,
  onReaction,
  messagesContainerRef,
  messagesEndRef,
  focusMessageId,
  onFocusHandled,
}: ChatThreadPanelProps) {
  // Motion no responde a las reglas CSS de reduced-motion: se ajusta aquí.
  const shouldReduceMotion = useReducedMotion();
  const { error: toastError } = useToast();
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const contentRef = useRef<HTMLDivElement>(null);

  // Si el usuario está al final, las imágenes/videos que terminan de cargar
  // alargan el hilo: sin esto el scroll se queda a media conversación (el
  // salto inicial ocurre antes de que el medio tenga altura).
  useEffect(() => {
    const container = messagesContainerRef.current;
    const content = contentRef.current;
    if (!container || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) container.scrollTop = container.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [messagesContainerRef, messages.length]);

  // Los mensajes se agrupan por día para que el separador pueda quedarse
  // pegado arriba mientras se lee ese día (como WhatsApp) y sea reemplazado
  // por el del día siguiente. Dentro de cada día se conserva la agrupación
  // por emisor/tiempo de 2 px.
  const groups = useMemo(() => {
    const result: { key: string; label: string; items: { msg: Message; grouped: boolean }[] }[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const prev = messages[i - 1];
      const sameDay = !!prev && new Date(prev.timestamp).toDateString() === new Date(msg.timestamp).toDateString();
      if (!prev || !sameDay) {
        result.push({ key: new Date(msg.timestamp).toDateString(), label: formatDayDivider(msg.timestamp), items: [] });
      }
      const grouped =
        !!prev &&
        sameDay &&
        prev.direction === msg.direction &&
        Math.abs(new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime()) <= 5 * 60 * 1000;
      result[result.length - 1].items.push({ msg, grouped });
    }
    return result;
  }, [messages]);

  // Día flotante (como WhatsApp): los separadores de día se quedan en su
  // lugar; mientras el usuario hace scroll aparece arriba el día visible y se
  // desvanece ~1 s después. Antes el separador era sticky y quedaba encimado
  // sobre las burbujas. Solo con scroll del usuario (rueda, toque, barra):
  // el auto-scroll al abrir el chat o al llegar mensajes no lo muestra.
  const [floatingDay, setFloatingDay] = useState<{ label: string; visible: boolean } | null>(null);
  const userScrollAtRef = useRef(0);
  const hideDayTimerRef = useRef<number | null>(null);
  const markUserScroll = () => {
    userScrollAtRef.current = Date.now();
  };

  function handleScroll() {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = atEnd;
    setAtBottom((previous) => (previous === atEnd ? previous : atEnd));

    if (Date.now() - userScrollAtRef.current > 400) return;
    const top = el.getBoundingClientRect().top + 8;
    let label: string | null = null;
    for (const node of el.querySelectorAll<HTMLElement>("[data-day-label]")) {
      if (node.getBoundingClientRect().top <= top) label = node.dataset.dayLabel ?? null;
      else break;
    }
    if (!label) return;
    setFloatingDay({ label, visible: true });
    if (hideDayTimerRef.current) window.clearTimeout(hideDayTimerRef.current);
    hideDayTimerRef.current = window.setTimeout(() => setFloatingDay((prev) => (prev ? { ...prev, visible: false } : prev)), 1100);
  }

  // Salto desde la búsqueda: cuando el mensaje ya está en el DOM se centra
  // (sin animación: viene de otro chat) y se ilumina. Se marca "no al final"
  // para que el ResizeObserver no lo devuelva al fondo al cargar imágenes.
  useEffect(() => {
    if (!focusMessageId) return;
    const container = messagesContainerRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-message-id="${focusMessageId}"]`);
    if (!target) return;
    atBottomRef.current = false;
    target.scrollIntoView({ behavior: "auto", block: "center" });
    const bubble = target.querySelector<HTMLElement>(".rounded-2xl") ?? target;
    const ring = ["ring-2", "ring-accent-strong", "ring-offset-2", "ring-offset-background"];
    bubble.classList.add(...ring);
    // Sin cleanup: onFocusHandled vuelve a correr el efecto y cancelaría el apagado.
    window.setTimeout(() => bubble.classList.remove(...ring), 2000);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se dispara por el id y cuando llegan los mensajes; onFocusHandled cambia en cada render del padre
  }, [focusMessageId, messages]);

  // Lleva al mensaje citado y lo ilumina un momento. Si la cita es más vieja
  // que el lote cargado, se avisa en vez de fingir que se saltó.
  function jumpToMessage(id: string) {
    const container = messagesContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    if (!target) {
      toastError("El mensaje citado no está cargado. Usa «Ver mensajes anteriores» para llegar a él.");
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const bubble = target.querySelector<HTMLElement>(".rounded-2xl") ?? target;
    const ring = ["ring-2", "ring-accent-strong", "ring-offset-2", "ring-offset-background"];
    bubble.classList.add(...ring);
    window.setTimeout(() => bubble.classList.remove(...ring), 1600);
  }

  return (
    <>
      <ChatConversationHeader
        key={selectedChat.id}
        chat={selectedChat}
        refreshKey={messages.at(-1)?.id ?? ""}
        typingUsers={typingUsers}
        onCloseChat={onCloseChat}
        onOpenContactDrawer={onOpenContactDrawer}
        onStatusChange={onStatusChange}
        onAssigned={onAssigned}
        onPriorityChange={onPriorityChange}
        onSnoozedChange={onSnoozedChange}
        onMacroApplied={onMacroApplied}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {floatingDay && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
            <span
              className={`rounded-full border border-border bg-surface px-2.5 py-1 text-micro font-medium text-muted-darker shadow-sm transition-opacity duration-300 ${floatingDay.visible ? "opacity-100" : "opacity-0"}`}
            >
              {floatingDay.label}
            </span>
          </div>
        )}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          onWheel={markUserScroll}
          onTouchMove={markUserScroll}
          onPointerDown={markUserScroll}
          onKeyDown={markUserScroll}
          className="chat-canvas scrollbar-thin flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {loadingMessages ? (
            <ChatBubblesSkeleton className="h-full" />
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState icon={MessageSquare} title="Sin mensajes" description="Aún no hay mensajes en este chat." />
            </div>
          ) : (
            <div ref={contentRef}>
              {hasOlderMessages && (
                <div className="flex justify-center pb-1">
                  <Button variant="secondary" size="sm" onClick={onLoadOlder} disabled={loadingOlder}>
                    {loadingOlder ? <Spinner /> : "Ver mensajes anteriores"}
                  </Button>
                </div>
              )}
              {groups.map((group) => (
                <div key={group.key} data-day-label={group.label}>
                  <div className="flex justify-center py-2">
                    <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-micro font-medium text-muted-darker shadow-sm">
                      {group.label}
                    </span>
                  </div>
                  {group.items.map(({ msg, grouped }) => (
                    <motion.div
                      key={msg.motionKey ?? msg.id}
                      data-message-id={msg.id}
                      className={grouped ? "mt-0.5" : "mt-2"}
                      initial={shouldReduceMotion || !msg.animateOnMount ? false : { opacity: 0, x: msg.direction === "INBOUND" ? -12 : 12, y: 4, scale: 0.985 }}
                      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <MessageBubble msg={msg} channel={selectedChat.channel} onPreview={onPreview} onRetry={onRetry} onReply={onReply} onReaction={onReaction} canReply={(selectedChat.channel === "WHATSAPP" || selectedChat.channel === "TELEGRAM") && !!msg.wamid} canQuote={canQuote} canReact={canReact} leadName={displayName(selectedChat.name, selectedChat.remoteJid)} reduceMotion={!!shouldReduceMotion} onJumpToMessage={jumpToMessage} />
                    </motion.div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        {!atBottom && (
          <Tooltip label="Ir al final"><button
            type="button"
            onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
            aria-label="Ir al final de la conversación"
            className="absolute bottom-3 right-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted-darker shadow-md transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-strong"
          >
            <ArrowDown size={18} />
          </button></Tooltip>
        )}
      </div>
    </>
  );
}
