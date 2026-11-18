import type { ChannelAccount, Conversation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { directReplyRoute, isCommentChannel, publicReplyTarget, type CommentThreadFacts, type DirectReplyRoute } from "./comment-rules";
import { sendMetaChannelOptions, sendMetaChannelPrivateReply, sendMetaChannelPublicCommentReply, sendMetaChannelText } from "./send";

// Envío de Messenger e Instagram en conversaciones que nacieron de un
// comentario (publicación, reel o anuncio). Único punto que decide si un mensaje sale
// como respuesta privada, como DM normal o no puede salir: lo usan el chat
// (chats/[chatId]/send) y sendOutbound (API, automatizaciones, macros). Las
// reglas puras viven en comment-rules.ts (también las usa la bandeja).

export class CommentReplyBlockedError extends Error {
  constructor(
    public readonly code: "awaiting_reply" | "comment_expired" | "no_comment" | "text_only",
    message: string
  ) {
    super(message);
  }
}

type MetaConversation = Conversation & { channelAccount: ChannelAccount };

/** Columnas extra del ChannelMessage saliente cuando responde a un comentario. */
export interface CommentReplyColumns {
  commentReplyKind: "private" | "public" | null;
  replyToExternalId: string | null;
}

export async function loadCommentThreadFacts(conversationId: string, now = new Date()): Promise<CommentThreadFacts> {
  const [latestInbound, latestDirect] = await Promise.all([
    prisma.channelMessage.findFirst({
      where: { conversationId, direction: "INBOUND" },
      orderBy: { timestamp: "desc" },
      select: { isFromComment: true, externalMessageId: true, timestamp: true },
    }),
    prisma.channelMessage.findFirst({
      where: { conversationId, direction: "INBOUND", isFromComment: false },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    }),
  ]);
  const answered =
    latestInbound?.isFromComment && latestInbound.externalMessageId
      ? await prisma.channelMessage.count({
          where: { conversationId, direction: "OUTBOUND", commentReplyKind: "private", replyToExternalId: latestInbound.externalMessageId },
        })
      : 0;
  return {
    latestInbound,
    privatelyAnswered: new Set(answered > 0 && latestInbound?.externalMessageId ? [latestInbound.externalMessageId] : []),
    lastDirectInboundAt: latestDirect?.timestamp ?? null,
    now,
  };
}

/** Ruta del próximo mensaje directo. Fuera de Messenger/Instagram siempre es un mensaje normal. */
export async function directRouteFor(conversation: MetaConversation, now = new Date()): Promise<DirectReplyRoute> {
  if (!isCommentChannel(conversation.channelAccount.channel)) return { kind: "message" };
  return directReplyRoute(await loadCommentThreadFacts(conversation.id, now));
}

/**
 * Texto (con opciones opcionales) por Messenger/Instagram respetando las
 * reglas de comentarios. La respuesta privada no admite quick replies: las
 * opciones van numeradas en el texto.
 */
export async function sendMetaDirectText(
  conversation: MetaConversation,
  params: { text: string; options?: { id: string; title: string }[] | null }
): Promise<{ externalMessageId: string | null } & CommentReplyColumns> {
  const route = await directRouteFor(conversation);
  if (route.kind === "blocked") throw new CommentReplyBlockedError(route.code, route.message);

  if (route.kind === "private_reply") {
    const text = params.options?.length ? `${params.text}\n\n${params.options.map((o, i) => `${i + 1}. ${o.title}`).join("\n")}` : params.text;
    const result = await sendMetaChannelPrivateReply(conversation.channelAccount, { commentId: route.commentId, body: text });
    await rememberMessengerId(conversation, result.recipientId);
    return { externalMessageId: result.externalMessageId, commentReplyKind: "private", replyToExternalId: route.commentId };
  }

  const { externalMessageId } = params.options?.length
    ? await sendMetaChannelOptions(conversation.channelAccount, { to: conversation.externalId, body: params.text, options: params.options })
    : await sendMetaChannelText(conversation.channelAccount, { to: conversation.externalId, body: params.text });
  return { externalMessageId, commentReplyKind: null, replyToExternalId: null };
}

/** Un archivo solo sale como mensaje normal: la respuesta privada es solo texto. */
export async function assertMetaMediaAllowed(conversation: MetaConversation): Promise<void> {
  const route = await directRouteFor(conversation);
  if (route.kind === "blocked") throw new CommentReplyBlockedError(route.code, route.message);
  if (route.kind === "private_reply") {
    throw new CommentReplyBlockedError("text_only", "La respuesta privada a un comentario solo puede ser texto. Manda el archivo cuando la persona conteste.");
  }
}

/** Respuesta pública bajo el último comentario de la persona (sin ventana de tiempo). */
export async function sendMetaPublicReply(conversation: MetaConversation, text: string): Promise<{ externalMessageId: string | null } & CommentReplyColumns> {
  if (!isCommentChannel(conversation.channelAccount.channel)) {
    throw new CommentReplyBlockedError("no_comment", "La respuesta pública solo existe para comentarios de Facebook e Instagram");
  }
  const latestComment = await prisma.channelMessage.findFirst({
    where: { conversationId: conversation.id, direction: "INBOUND", isFromComment: true },
    orderBy: { timestamp: "desc" },
    select: { externalMessageId: true },
  });
  const commentId = publicReplyTarget(latestComment);
  if (!commentId) throw new CommentReplyBlockedError("no_comment", "Esta conversación no tiene comentarios a los que responder en público");
  const result = await sendMetaChannelPublicCommentReply(conversation.channelAccount, { commentId, body: text });
  return { externalMessageId: result.externalMessageId, commentReplyKind: "public", replyToExternalId: commentId };
}

// El PSID que devolvió la respuesta privada, si es otro que el del
// comentarista: con él, la respuesta de la persona por Messenger entra a esta
// conversación (ingesta) y los mensajes siguientes le llegan (send.ts). Si otra
// conversación ya lo usa (la persona había escrito por DM antes de comentar),
// se deja así: esa otra conversación sigue recibiendo sus DMs.
async function rememberMessengerId(conversation: MetaConversation, psid: string | null): Promise<void> {
  if (!psid || psid === conversation.externalId || psid === conversation.aliasExternalId) return;
  const taken = await prisma.conversation.findFirst({
    where: { channelAccountId: conversation.channelAccountId, OR: [{ externalId: psid }, { aliasExternalId: psid }] },
    select: { id: true },
  });
  if (taken) return;
  await prisma.conversation
    .update({ where: { id: conversation.id }, data: { aliasExternalId: psid } })
    .catch((err) => console.error("[meta comment-reply] no se pudo guardar el PSID:", err));
}

/**
 * Ingesta: un DM de Messenger cuyo remitente es el PSID aprendido de una
 * respuesta privada pertenece a la conversación del comentario. Devuelve el
 * externalId con el que hay que guardarlo.
 */
export async function resolveInboundExternalId(channelAccountId: string, externalId: string): Promise<string> {
  const direct = await prisma.conversation.findUnique({
    where: { channelAccountId_externalId: { channelAccountId, externalId } },
    select: { id: true },
  });
  if (direct) return externalId;
  const aliased = await prisma.conversation.findUnique({
    where: { channelAccountId_aliasExternalId: { channelAccountId, aliasExternalId: externalId } },
    select: { externalId: true },
  });
  return aliased?.externalId ?? externalId;
}
