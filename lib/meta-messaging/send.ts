import type { ChannelAccount } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { sendMetaChannelMessage, uploadMetaAttachment } from "@/lib/meta-messaging";

// Shape de ChannelAccount.credentials para MESSENGER/INSTAGRAM — ambos
// comparten pageId+pageAccessToken (modelo Página-vinculada); IG además
// guarda instagramBusinessId (entry[].id del webhook de IG reporta el ID
// de Instagram, no el de la Página, ver app/api/meta/webhook/messaging).
export interface MetaChannelCredentials {
  pageId: string;
  pageAccessToken: string;
  appSecret?: string;
  instagramBusinessId?: string;
}

export function getMetaChannelCredentials(account: ChannelAccount): MetaChannelCredentials {
  return JSON.parse(decrypt(account.credentials)) as MetaChannelCredentials;
}

interface SendParams {
  to: string;
  body: string;
}

// Unified outbound sender — paralelo a lib/telegram/send.ts:sendTelegramMessage.
export async function sendMetaChannelText(
  account: ChannelAccount,
  params: SendParams
): Promise<{ externalMessageId: string | null }> {
  const { pageId, pageAccessToken } = getMetaChannelCredentials(account);
  const result = await sendMetaChannelMessage(pageAccessToken, pageId, params.to, { text: params.body });
  return { externalMessageId: result.messageId };
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
  const { pageId, pageAccessToken } = getMetaChannelCredentials(account);
  const uploaded = await uploadMetaAttachment(pageAccessToken, pageId, params.buffer, params.filename, params.mimeType);
  const result = await sendMetaChannelMessage(pageAccessToken, pageId, params.to, {
    attachmentId: uploaded.attachmentId,
    mimeType: params.mimeType,
  });
  return { externalMessageId: result.messageId, attachmentId: uploaded.attachmentId };
}
