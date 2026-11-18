// Reglas de Meta para contestar a alguien que comentó una publicación, reel o
// anuncio de la Página de Facebook o de la cuenta de Instagram (las mismas en
// los dos: Private Replies de Messenger e Instagram). Puras y sin imports de
// servidor: las usa el envío (comment-reply.ts) y la bandeja, para avisar
// antes de escribir.
//
// - Respuesta privada: POST /{page-id}/messages con recipient.comment_id. Una
//   sola por comentario y dentro de los 7 días desde que se escribió.
// - Después, Meta solo deja seguir por mensaje directo cuando la persona contesta, y
//   dentro de las 24 h siguientes a su último mensaje directo.
// - Respuesta pública (en la publicación): sin ventana ni límite.
// Fuente: developers.facebook.com → Messenger Platform / Instagram → Private Replies.

export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CommentThreadFacts {
  /** Último mensaje entrante de la conversación (comentario o DM). */
  latestInbound: { isFromComment: boolean; externalMessageId: string | null; timestamp: Date } | null;
  /** Comentarios a los que ya se mandó la respuesta privada. */
  privatelyAnswered: ReadonlySet<string>;
  /** Último mensaje directo (no comentario) de la persona. */
  lastDirectInboundAt: Date | null;
  now: Date;
}

export type DirectReplyRoute =
  | { kind: "message" }
  | { kind: "private_reply"; commentId: string }
  | { kind: "blocked"; code: "awaiting_reply" | "comment_expired"; message: string };

/**
 * Cómo sale un mensaje directo (no la respuesta pública) en una conversación
 * de Messenger. Si lo último que escribió la persona es un comentario, la
 * primera respuesta es privada; luego hay que esperar a que conteste.
 */
export function directReplyRoute(facts: CommentThreadFacts): DirectReplyRoute {
  const latest = facts.latestInbound;
  if (!latest?.isFromComment || !latest.externalMessageId) return { kind: "message" };

  const commentId = latest.externalMessageId;
  const answered = facts.privatelyAnswered.has(commentId);
  const expired = facts.now.getTime() - latest.timestamp.getTime() > PRIVATE_REPLY_WINDOW_MS;
  if (!answered && !expired) return { kind: "private_reply", commentId };

  const dmOpen = !!facts.lastDirectInboundAt && facts.now.getTime() - facts.lastDirectInboundAt.getTime() <= MESSAGING_WINDOW_MS;
  if (dmOpen) return { kind: "message" };

  return answered
    ? {
        kind: "blocked",
        code: "awaiting_reply",
        message: "Ya le mandaste el mensaje privado de este comentario. Meta solo permite uno: podrás seguir cuando la persona conteste. Mientras, puedes responder en público.",
      }
    : {
        kind: "blocked",
        code: "comment_expired",
        message: "El comentario tiene más de 7 días: Meta ya no permite responderle en privado. Puedes responder en público.",
      };
}

/** El comentario al que va una respuesta pública: el último que escribió la persona. */
export function publicReplyTarget(latestComment: { externalMessageId: string | null } | null): string | null {
  return latestComment?.externalMessageId ?? null;
}

/** Canales donde un comentario abre conversación y aplican estas reglas. */
export function isCommentChannel(channel: string): boolean {
  return channel === "MESSENGER" || channel === "INSTAGRAM";
}

/**
 * Enlace a la publicación de un comentario: Facebook guarda el post_id
 * ("<pageId>_<postId>"), Instagram el permalink que dio Meta. null si no hay.
 */
export function commentPostUrl(postId: string | null | undefined): string | null {
  if (!postId) return null;
  if (/^\d+_\d+$/.test(postId)) return `https://www.facebook.com/${postId}`;
  if (/^https:\/\/www\.instagram\.com\/[A-Za-z0-9_\-/]+$/.test(postId)) return postId;
  return null;
}
