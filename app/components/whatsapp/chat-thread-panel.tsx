"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
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
} from "lucide-react";
import { ChatMessageActions } from "./chat-message-actions";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
import { EmptyState } from "@/app/components/ui/empty-state";
import { Modal } from "@/app/components/ui/modal";
import { ChatConversationHeader } from "./chat-conversation-header";
import { ChatBubblesSkeleton } from "@/app/components/whatsapp/chat-skeletons";
import { mediaEndpointFor } from "@/lib/whatsapp/media-shared";
import {
  formatBubbleTime,
  formatDayDivider,
  formatBytes,
  type ChatItem,
  type ChatStatus,
  type Message,
  type AgentReaction,
  type PreviewMedia,
} from "./chat-shared";

// Header del hilo + área de mensajes — extraído de chat-workspace.tsx sin
// tocar el merge por id del polling ni el scroll (ambos se quedan en el
// orquestador, que sigue siendo dueño de `messages`/los refs de scroll).

const MESSAGE_STATUS_LABEL: Record<string, string> = {
  sending: "Enviando", failed: "No enviado", sent: "Enviado",
  delivered: "Entregado", read: "Leído",
};

function MediaContent({ msg, onPreview }: { msg: Message; onPreview: (media: PreviewMedia) => void }) {
  const mediaSrc = msg.localPreviewUrl ?? (msg.mediaUrl ? mediaEndpointFor(msg.id) : null);

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
          className={msg.messageType === "sticker" ? "h-36 w-36 max-w-full object-contain sm:h-44 sm:w-44" : "max-w-full max-h-72 rounded-lg object-cover"}
          loading="lazy"
        />
      </button>
    );
  }

  if (msg.messageType === "audio") {
    if (!mediaSrc) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-darker">
          <FileAudio size={14} />
          <span>Audio recibido</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <audio controls src={mediaSrc} className="w-full max-w-xs" />
        <a
          href={mediaSrc}
          download={msg.filename ?? undefined}
          className="text-muted-darker hover:text-foreground shrink-0"
          title="Descargar audio"
        >
          <Download size={14} />
        </a>
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
        <video controls src={mediaSrc} className="max-w-full max-h-72 rounded-lg" />
        <button
          type="button"
          onClick={() => onPreview({ type: "video", src: mediaSrc, filename: msg.filename, mimeType: msg.mimeType })}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70"
          title="Ver en grande"
        >
          <Maximize2 size={14} />
        </button>
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
    return (
      <a
        href={mediaSrc}
        download={msg.filename ?? undefined}
        className="flex items-center gap-2 text-xs hover:underline"
      >
        <FileText size={14} />
        <span className="truncate">{msg.filename ?? "Documento"}</span>
        {msg.bytesSize ? <span className="text-muted-darker">({formatBytes(msg.bytesSize)})</span> : null}
      </a>
    );
  }

  return null;
}

function MessageBubble({
  msg,
  onPreview,
  onRetry,
  onReply,
  onReaction,
  canReply,
  leadName,
  reduceMotion,
}: {
  msg: Message;
  onPreview: (media: PreviewMedia) => void;
  onRetry?: (msg: Message) => void;
  onReply?: (msg: Message) => void;
  onReaction: (id: string, reaction: AgentReaction) => void;
  canReply: boolean;
  leadName: string;
  reduceMotion: boolean;
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

  return (
    <div className={`group flex items-end gap-1.5 ${isInbound ? "justify-start" : "justify-end"}`}>
      {!isInbound && canReply && <ChatMessageActions message={msg} onReply={onReply} onReaction={onReaction} />}
      <div
        className={`relative max-w-[75%] px-3.5 py-2.5 text-sm leading-relaxed transition-opacity duration-base ${
          msg.messageType === "sticker" ? "rounded-xl bg-transparent text-foreground" : isInbound
            ? "rounded-2xl rounded-tl-sm bg-surface text-foreground"
            : "rounded-2xl rounded-tr-sm bg-accent-muted text-foreground"
        } ${msg.status === "sending" ? "opacity-70" : ""} ${isFailed ? "opacity-90 ring-1 ring-danger" : ""}`}
      >
        {msg.isFromComment && (
          <div className={`mb-1 flex items-center gap-1 text-[10px] font-medium ${isInbound ? "text-muted-darker" : "text-foreground/65"}`}>
            <MessageSquare size={10} />
            <span>Desde un comentario</span>
          </div>
        )}
        {msg.replyToWamid && (
          <div className="mb-2 max-w-full border-l-2 border-accent-strong bg-background/50 px-2.5 py-1.5 rounded-r-lg text-xs">
            <span className="block font-semibold text-accent-ink">{msg.replyTo?.direction === "OUTBOUND" ? "Tú" : msg.replyTo?.direction === "INBOUND" ? leadName : "Mensaje citado"}</span>
            <span className="block truncate text-muted-darker">{msg.replyTo ? (msg.replyTo.body || msg.replyTo.caption || `[${msg.replyTo.messageType}]`) : "Mensaje anterior"}</span>
          </div>
        )}
        {hasMedia && (
          <div className="mb-1 space-y-1">
            <MediaContent msg={msg} onPreview={onPreview} />
            {caption && <p className="whitespace-pre-wrap break-words">{caption}</p>}
          </div>
        )}
        {!hasMedia && msg.body}
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
        <div className={`flex items-center justify-end gap-1 mt-1 ${
          isInbound ? "text-muted-darker" : "text-foreground/65"
        }`}>
          {isFailed && (
            <button
              type="button"
              onClick={() => onRetry?.(msg)}
              className="flex items-center gap-1 text-[10px] font-medium text-danger hover:underline mr-1"
            >
              <RotateCw size={10} /> Reintentar
            </button>
          )}
          <span className="text-[10px]">{formatBubbleTime(msg.timestamp)}</span>
          {!isInbound && msg.status && (
            <AnimatePresence initial={false} mode="wait">
              <motion.span key={msg.status} className="text-[10px]" role="img" aria-label={MESSAGE_STATUS_LABEL[msg.status] ?? msg.status}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.8 }}
                transition={{ duration: reduceMotion ? 0 : 0.12 }}>
                {msg.status === "sending" && <Clock size={10} />}
                {msg.status === "failed" && <AlertCircle size={10} className="text-danger" />}
                {msg.status === "sent" && <Check size={10} />}
                {msg.status === "delivered" && <CheckCheck size={10} />}
                {msg.status === "read" && <CheckCheck size={10} className="text-info" />}
              </motion.span>
            </AnimatePresence>
          )}
        </div>
        {(msg.reactionEmoji || ownEmoji || reactionPending || reactionFailed) && <div className="mt-1 flex flex-wrap justify-end gap-1" aria-live="polite">
          {msg.reactionEmoji && <span className="rounded-xl border border-border bg-surface px-1.5 py-0.5 text-sm leading-none shadow-sm" aria-label={`${leadName} reaccionó con ${msg.reactionEmoji}`} title={`Reacción de ${leadName}`}>{msg.reactionEmoji}</span>}
          {(ownEmoji || reactionPending) && <span className="inline-flex items-center gap-1 rounded-xl border border-accent-muted bg-surface px-1.5 py-0.5 text-xs" title={reactionPending ? "Reacción enviada a WhatsApp; pendiente de confirmación" : "Reacción del equipo"}>{ownEmoji || "Quitar reacción"} <span className="text-[10px] text-muted-darker">Equipo</span>{reactionPending && <Clock size={10} />}</span>}
          {reactionFailed && <span role="status" className="text-xs text-danger" title={latestReaction.error ?? "WhatsApp rechazó la reacción"}>No se pudo actualizar la reacción</span>}
        </div>}
      </div>
      {isInbound && canReply && <ChatMessageActions message={msg} onReply={onReply} onReaction={onReaction} />}
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
  selectedChat: ChatItem;
  messages: Message[];
  loadingMessages: boolean;
  hasOlderMessages: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onCloseChat: () => void;
  onOpenContactDrawer: () => void;
  onStatusChange: (status: ChatStatus) => void | Promise<void>;
  onAssigned: (assignee: { id: string; name: string | null } | null) => void;
  onPreview: (media: PreviewMedia) => void;
  onRetry: (msg: Message) => void;
  onReply: (msg: Message) => void;
  onReaction: (id: string, reaction: AgentReaction) => void;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatThreadPanel({
  selectedChat,
  messages,
  loadingMessages,
  hasOlderMessages,
  loadingOlder,
  onLoadOlder,
  onCloseChat,
  onOpenContactDrawer,
  onStatusChange,
  onAssigned,
  onPreview,
  onRetry,
  onReply,
  onReaction,
  messagesContainerRef,
  messagesEndRef,
}: ChatThreadPanelProps) {
  // Motion no responde a las reglas CSS de reduced-motion: se ajusta aquí.
  const shouldReduceMotion = useReducedMotion();

  return (
    <>
      <ChatConversationHeader
        key={selectedChat.id}
        chat={selectedChat}
        refreshKey={messages.at(-1)?.id ?? ""}
        onCloseChat={onCloseChat}
        onOpenContactDrawer={onOpenContactDrawer}
        onStatusChange={onStatusChange}
        onAssigned={onAssigned}
      />

      <div ref={messagesContainerRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loadingMessages ? (
          <ChatBubblesSkeleton className="h-full" />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState icon={MessageSquare} title="Sin mensajes" description="Aún no hay mensajes en este chat." />
          </div>
        ) : (
          <>
            {hasOlderMessages && (
              <div className="flex justify-center pb-1">
                <Button variant="secondary" size="sm" onClick={onLoadOlder} disabled={loadingOlder}>
                  {loadingOlder ? <Spinner /> : "Ver mensajes anteriores"}
                </Button>
              </div>
            )}
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => {
                const prev = messages[i - 1];
                const showDivider = !prev || new Date(prev.timestamp).toDateString() !== new Date(msg.timestamp).toDateString();
                return (
                  <motion.div
                    key={msg.motionKey ?? msg.id}
                    initial={shouldReduceMotion || !msg.animateOnMount ? false : { opacity: 0, x: msg.direction === "INBOUND" ? -12 : 12, y: 4, scale: 0.985 }}
                    animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {showDivider && (
                      <div className="flex justify-center my-3">
                        <span className="text-[11px] font-medium text-muted-darker bg-surface border border-border px-2.5 py-1 rounded-full">
                          {formatDayDivider(msg.timestamp)}
                        </span>
                      </div>
                    )}
                    <MessageBubble msg={msg} onPreview={onPreview} onRetry={onRetry} onReply={onReply} onReaction={onReaction} canReply={selectedChat.channel === "WHATSAPP" && !!msg.wamid} leadName={selectedChat.name || selectedChat.remoteJid} reduceMotion={!!shouldReduceMotion} />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </>
        )}
        <div ref={messagesEndRef} />
      </div>
    </>
  );
}
