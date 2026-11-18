import type { ChannelAccount } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { sendMetaChannelMessage, uploadMetaAttachment, sendPrivateReplyToComment, replyToCommentPublicly, replyToInstagramComment } from "@/lib/meta-messaging";
import { prisma } from "@/lib/prisma";
import { assertOrgCanSend } from "@/lib/billing/gates";

// Shape de ChannelAccount.credentials para MESSENGER/INSTAGRAM — ambos
// comparten pageId+pageAccessToken (modelo Página-vinculada); IG además
// guarda instagramBusinessId (entry[].id del webhook de IG reporta el ID
// de Instagram, no el de la Página, ver app/api/meta/webhook/messaging).
export interface MetaChannelCredentials {
  pageId: string;
  pageAccessToken: string;
  appSecret?: string;
  instagramBusinessId?: string;
  /** "platform": conectada con la app de Colibly (sin appSecret propio; el webhook se firma con el de la plataforma). */
  connection?: "manual" | "platform";
}

export function getMetaChannelCredentials(account: ChannelAccount): MetaChannelCredentials {
  return JSON.parse(decrypt(account.credentials)) as MetaChannelCredentials;
}

interface SendParams {
  to: string;
  body: string;
}

// Destinatario real de un mensaje directo: si la conversación nació de un
// comentario y la persona tiene otro id en Messenger (aliasExternalId, lo
// aprendió la respuesta privada), los envíos van a ese. Aquí y no en cada
// llamador: así el chat, la API, las automatizaciones, el bot y la
// recuperación de leads usan el mismo.
async function resolveRecipient(account: ChannelAccount, to: string): Promise<string> {
  if (account.channel !== "MESSENGER" && account.channel !== "INSTAGRAM") return to;
  const conversation = await prisma.conversation.findUnique({
    where: { channelAccountId_externalId: { channelAccountId: account.id, externalId: to } },
    select: { aliasExternalId: true },
  });
  return conversation?.aliasExternalId ?? to;
}

// Unified outbound sender — paralelo a lib/telegram/send.ts:sendTelegramMessage.
export async function sendMetaChannelText(
  account: ChannelAccount,
  params: SendParams
): Promise<{ externalMessageId: string | null }> {
  await assertOrgCanSend(account.organizationId);
  const { pageId, pageAccessToken } = getMetaChannelCredentials(account);
  const result = await sendMetaChannelMessage(pageAccessToken, pageId, await resolveRecipient(account, params.to), { text: params.body });
  return { externalMessageId: result.messageId };
}

// Opciones como quick replies (Messenger e Instagram). Títulos recortados a
// 20 caracteres, límite de Meta.
export async function sendMetaChannelOptions(
  account: ChannelAccount,
  params: { to: string; body: string; options: { id: string; title: string }[] }
): Promise<{ externalMessageId: string | null }> {
  await assertOrgCanSend(account.organizationId);
  const { pageId, pageAccessToken } = getMetaChannelCredentials(account);
  const result = await sendMetaChannelMessage(pageAccessToken, pageId, await resolveRecipient(account, params.to), { text: params.body, quickReplies: params.options });
  return { externalMessageId: result.messageId };
}

// Respuesta privada a un comentario de Facebook o Instagram (una por
// comentario, 7 días; el mismo Send API de la Página).
// Devuelve también el PSID de la persona: comment-reply.ts lo guarda como
// aliasExternalId para que su respuesta por Messenger caiga en este chat.
export async function sendMetaChannelPrivateReply(
  account: ChannelAccount,
  params: { commentId: string; body: string }
): Promise<{ externalMessageId: string | null; recipientId: string | null }> {
  await assertOrgCanSend(account.organizationId);
  const { pageId, pageAccessToken } = getMetaChannelCredentials(account);
  const result = await sendPrivateReplyToComment(pageAccessToken, pageId, params.commentId, params.body);
  return { externalMessageId: result.messageId || null, recipientId: result.recipientId || null };
}

// Respuesta pública bajo el comentario (publicación o anuncio de Facebook, o
// publicación/reel de Instagram).
export async function sendMetaChannelPublicCommentReply(
  account: ChannelAccount,
  params: { commentId: string; body: string }
): Promise<{ externalMessageId: string | null }> {
  await assertOrgCanSend(account.organizationId);
  const { pageAccessToken } = getMetaChannelCredentials(account);
  const result =
    account.channel === "INSTAGRAM"
      ? await replyToInstagramComment(pageAccessToken, params.commentId, params.body)
      : await replyToCommentPublicly(pageAccessToken, params.commentId, params.body);
  return { externalMessageId: result.commentId || null };
}

interface SendMediaParams {
  to: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export async function sendMetaChannelMedia(
  account: ChannelAccount,
  params: SendMediaParams
): Promise<{ externalMessageId: string | null; attachmentId: string | null }> {
  await assertOrgCanSend(account.organizationId);
  const { pageId, pageAccessToken } = getMetaChannelCredentials(account);
  const uploaded = await uploadMetaAttachment(pageAccessToken, pageId, params.buffer, params.filename, params.mimeType);
  const result = await sendMetaChannelMessage(pageAccessToken, pageId, await resolveRecipient(account, params.to), {
    attachmentId: uploaded.attachmentId,
    mimeType: params.mimeType,
  });
  return { externalMessageId: result.messageId, attachmentId: uploaded.attachmentId };
}
