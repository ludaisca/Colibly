import type { ChannelAccount } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { sendTextMessage, sendMediaMessage, sendKeyboardMessage, type TelegramMediaKind } from "@/lib/telegram";
import { assertOrgCanSend } from "@/lib/billing/gates";

interface SendParams {
  to: string;
  body: string;
}

// Unified outbound sender for Telegram accounts — paralelo a
// lib/whatsapp/send.ts:sendWhatsAppMessage.
export async function sendTelegramMessage(
  account: ChannelAccount,
  params: SendParams
): Promise<{ externalMessageId: string | null }> {
  await assertOrgCanSend(account.organizationId);
  const { botToken } = JSON.parse(decrypt(account.credentials)) as { botToken: string };
  const result = await sendTextMessage(botToken, params.to, params.body);
  return { externalMessageId: String(result.message_id) };
}

const KIND_MAP: Record<"image" | "audio" | "video" | "document", TelegramMediaKind> = {
  image: "photo",
  audio: "audio",
  video: "video",
  document: "document",
};

interface SendMediaParams {
  to: string;
  type: "image" | "audio" | "video" | "document";
  buffer: Buffer;
  filename: string;
  mimeType: string;
  caption?: string;
}

export async function sendTelegramMedia(
  account: ChannelAccount,
  params: SendMediaParams
): Promise<{ externalMessageId: string | null; fileId: string | null }> {
  await assertOrgCanSend(account.organizationId);
  const { botToken } = JSON.parse(decrypt(account.credentials)) as { botToken: string };
  const kind = KIND_MAP[params.type];
  const result = await sendMediaMessage(botToken, params.to, kind, params.buffer, params.filename, params.mimeType, params.caption);
  let fileId: string | null = null;
  if (kind === "photo") fileId = result.photo?.at(-1)?.file_id ?? null;
  else if (kind === "document") fileId = result.document?.file_id ?? null;
  else if (kind === "audio") fileId = result.audio?.file_id ?? null;
  else if (kind === "video") fileId = result.video?.file_id ?? null;
  return { externalMessageId: String(result.message_id), fileId };
}

// Opciones (botones/lista de una automatización o de la API) como teclado
// inline. Telegram no distingue botones de lista: una opción por fila.
export async function sendTelegramOptions(
  account: ChannelAccount,
  params: { to: string; body: string; options: { id: string; title: string }[] }
): Promise<{ externalMessageId: string | null }> {
  await assertOrgCanSend(account.organizationId);
  const { botToken } = JSON.parse(decrypt(account.credentials)) as { botToken: string };
  const result = await sendKeyboardMessage(botToken, params.to, params.body, params.options);
  return { externalMessageId: String(result.message_id) };
}
