"use client";

import { Segmented } from "@/app/components/ui/segmented";
import { directReplyRoute, type DirectReplyRoute } from "@/lib/meta-messaging/comment-rules";
import type { Message } from "./chat-shared";

export type CommentReplyMode = "private" | "public";

/**
 * Ruta del próximo mensaje directo según los mensajes cargados del chat (las
 * mismas reglas que aplica el servidor: lib/meta-messaging/comment-rules.ts).
 * null si la conversación no tiene comentarios.
 */
export function commentRouteFromMessages(messages: Message[], now = new Date()): DirectReplyRoute | null {
  if (!messages.some((m) => m.direction === "INBOUND" && m.isFromComment)) return null;
  const inbound = messages.filter((m) => m.direction === "INBOUND");
  const latest = inbound[inbound.length - 1] ?? null;
  const lastDirect = [...inbound].reverse().find((m) => !m.isFromComment) ?? null;
  const answered = new Set(
    messages.filter((m) => m.direction === "OUTBOUND" && m.commentReplyKind === "private" && m.replyToWamid).map((m) => m.replyToWamid as string)
  );
  return directReplyRoute({
    latestInbound: latest ? { isFromComment: !!latest.isFromComment, externalMessageId: latest.wamid ?? null, timestamp: new Date(latest.timestamp) } : null,
    privatelyAnswered: answered,
    lastDirectInboundAt: lastDirect ? new Date(lastDirect.timestamp) : null,
    now,
  });
}

/** Modo por defecto: en privado si Meta lo permite; si no, en la publicación. */
export function defaultCommentMode(route: DirectReplyRoute | null): CommentReplyMode {
  return route?.kind === "blocked" ? "public" : "private";
}

const HINTS: Record<string, string> = {
  public: "Se publica como respuesta bajo su último comentario: cualquiera que vea la publicación la puede leer.",
  private_reply: "Le llega como mensaje directo en respuesta a su comentario. Meta permite uno solo: después podrás seguir cuando la persona conteste.",
};

// Barra sobre el compositor en chats de Messenger e Instagram que vienen de
// comentarios (publicaciones, reels o anuncios): elige si contestar en privado o en la
// publicación y explica la regla de Meta que aplica ahora.
export function CommentReplyBar({ route, mode, onModeChange }: { route: DirectReplyRoute; mode: CommentReplyMode; onModeChange: (mode: CommentReplyMode) => void }) {
  const hint = mode === "public" ? HINTS.public : route.kind === "blocked" ? route.message : route.kind === "private_reply" ? HINTS.private_reply : null;
  const warn = mode === "private" && route.kind === "blocked";
  return (
    <div className="flex flex-col gap-1.5 border-t border-border bg-surface px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
      <Segmented
        label="Cómo responder al comentario"
        className="shrink-0 self-start sm:self-auto"
        value={mode}
        onChange={onModeChange}
        options={[
          { value: "private", label: "Mensaje privado" },
          { value: "public", label: "En la publicación" },
        ]}
      />
      {hint && <p className={`min-w-0 text-xs ${warn ? "text-warning" : "text-muted"}`}>{hint}</p>}
    </div>
  );
}
