"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
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
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
import { EmptyState } from "@/app/components/ui/empty-state";
import { Modal } from "@/app/components/ui/modal";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { ChatAssigneePicker } from "@/app/components/whatsapp/chat-assignee-picker";
import { ChatTagPicker } from "@/app/components/whatsapp/chat-tag-picker";
import { LeadScoreBadge } from "@/app/components/whatsapp/lead-score-badge";
import { ChatCostBadge } from "@/app/components/whatsapp/chat-cost-badge";
import { ChatBubblesSkeleton } from "@/app/components/whatsapp/chat-skeletons";
import { mediaEndpointFor } from "@/lib/whatsapp/media-shared";
import {
  STATUS_BADGE,
  accountTone,
  formatBubbleTime,
  formatDayDivider,
  formatBytes,
  type ChatItem,
  type ChatStatus,
  type Message,
  type PreviewMedia,
} from "./chat-shared";

// Header del hilo + área de mensajes — extraído de chat-workspace.tsx sin
// tocar el merge por id del polling ni el scroll (ambos se quedan en el
// orquestador, que sigue siendo dueño de `messages`/los refs de scroll).

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
          className="max-w-full max-h-72 rounded-lg object-cover"
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
}: {
  msg: Message;
  onPreview: (media: PreviewMedia) => void;
  onRetry?: (msg: Message) => void;
}) {
  const isInbound = msg.direction === "INBOUND";
  const hasMedia = msg.messageType !== "text" && (msg.mediaUrl || msg.mediaId || msg.localPreviewUrl);
  const caption = msg.caption ?? (hasMedia && msg.body && msg.body !== `[${msg.messageType}]` ? msg.body : null);
  const isFailed = msg.status === "failed";
  const buttons = msg.messageType === "interactive" ? msg.interactivePayload?.buttons : undefined;

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[75%] px-3.5 py-2.5 text-sm leading-relaxed transition-opacity duration-base ${
          isInbound
            ? "rounded-2xl rounded-tl-sm bg-surface text-foreground"
            : "rounded-2xl rounded-tr-sm bg-accent text-on-accent"
        } ${msg.status === "sending" ? "opacity-70" : ""} ${isFailed ? "opacity-90 ring-1 ring-danger" : ""}`}
      >
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
          // esta burbuja ya es bg-accent/text-on-accent (ver arriba) — por
          // eso el divisor/texto usan tonos on-accent, no los tokens neutros
          // que usaría una burbuja inbound.
          <div className="mt-2 pt-2 border-t border-on-accent/25 space-y-1">
            {buttons.map((b) => (
              <div key={b.id} className="flex items-center justify-center gap-1.5 text-xs py-1">
                <CornerUpLeft size={12} />
                <span>{b.title}</span>
              </div>
            ))}
          </div>
        )}
        <div className={`flex items-center justify-end gap-1 mt-1 ${
          isInbound ? "text-muted-darker" : "text-on-accent/70"
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
            <span className="text-[10px]">
              {msg.status === "sending" && <Clock size={10} />}
              {msg.status === "failed" && <AlertCircle size={10} className="text-danger" />}
              {msg.status === "sent" && <Check size={10} />}
              {msg.status === "delivered" && <CheckCheck size={10} />}
              {msg.status === "read" && <CheckCheck size={10} className="text-info" />}
            </span>
          )}
        </div>
      </div>
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
  onStatusChange: (status: ChatStatus) => void;
  onAssigned: (assignee: { id: string; name: string | null } | null) => void;
  onPreview: (media: PreviewMedia) => void;
  onRetry: (msg: Message) => void;
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
  messagesContainerRef,
  messagesEndRef,
}: ChatThreadPanelProps) {
  // CSS ya neutraliza animate-* globalmente (globals.css), pero motion no
  // corre por CSS — se apaga a mano la transición de entrada/salida de
  // burbujas cuando el usuario prefiere menos movimiento.
  const shouldReduceMotion = useReducedMotion();

  return (
    <>
      <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap px-4 py-3 border-b border-border bg-surface shrink-0">
        {/* Identidad: nombre/cuenta truncan antes de ceder espacio a los
            controles de la derecha. Ambos grupos son items independientes de
            este row — si no caben lado a lado, flex-wrap los apila en dos
            líneas en vez de aplastarlos (pantallas angostas / mobile). */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onCloseChat}
            className="md:hidden text-muted-darker hover:text-foreground transition-colors shrink-0"
            aria-label="Volver a la lista de chats"
          >
            <ArrowLeft size={18} />
          </button>
          {/* Mismo EntityAvatar (id=accountId, mismo hue) que ya usan la fila
              de la lista y el rail — coherencia visual entre las 3 vistas del
              chat. Si hay contacto asociado, el propio avatar es el disparador
              para abrir su ficha (mismo gesto que WhatsApp Web). */}
          {selectedChat.contactId ? (
            <button
              onClick={onOpenContactDrawer}
              className="shrink-0"
              title="Ver contacto"
              aria-label="Ver contacto"
            >
              <EntityAvatar id={selectedChat.accountId} name={selectedChat.name ?? selectedChat.remoteJid} size="sm" />
            </button>
          ) : (
            <EntityAvatar id={selectedChat.accountId} name={selectedChat.name ?? selectedChat.remoteJid} size="sm" className="shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">
                {selectedChat.name ?? selectedChat.remoteJid}
              </p>
              <Badge tone={accountTone(selectedChat.accountId)} size="sm" className="shrink-0">
                {selectedChat.account.name}
              </Badge>
            </div>
            {selectedChat.account.phoneNumber && (
              <p className="text-[11px] text-muted-darker truncate">
                {selectedChat.account.phoneNumber}
              </p>
            )}
          </div>
        </div>

        {/* Controles de la conversación, alineados a la derecha */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedChat.status}
            onChange={(e) => onStatusChange(e.target.value as ChatStatus)}
            className="text-xs font-medium rounded-md border border-border bg-surface-light px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
            title="Estado de la conversación"
          >
            {(Object.keys(STATUS_BADGE) as ChatStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_BADGE[s].label}</option>
            ))}
          </select>
          <ChatTagPicker key={selectedChat.id} chatId={selectedChat.id} />
          <LeadScoreBadge key={`score-${selectedChat.id}`} chatId={selectedChat.id} />
          <ChatCostBadge key={`cost-${selectedChat.id}`} chatId={selectedChat.id} />
          <ChatAssigneePicker
            chatId={selectedChat.id}
            assignedTo={selectedChat.assignedTo}
            onAssigned={onAssigned}
          />
        </div>
      </div>

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
                    key={msg.id}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.4, 0, 0.2, 1] }}
                  >
                    {showDivider && (
                      <div className="flex justify-center my-3">
                        <span className="text-[11px] font-medium text-muted-darker bg-surface border border-border px-2.5 py-1 rounded-full">
                          {formatDayDivider(msg.timestamp)}
                        </span>
                      </div>
                    )}
                    <MessageBubble msg={msg} onPreview={onPreview} onRetry={onRetry} />
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
