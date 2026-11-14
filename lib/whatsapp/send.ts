import type { WAAccount } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { sendMessage as sendMetaMessage } from "@/lib/whatsapp";
import { assertOrgCanSend } from "@/lib/billing/gates";

interface SendParams {
  to: string;
  type: "text" | "image" | "audio" | "video" | "document" | "sticker" | "reaction" | "location" | "contacts";
  reactionMessageId?: string;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: Record<string, unknown>[];
  emoji?: string;
  body?: string;
  mediaId?: string | null;
  mimeType?: string;
  caption?: string;
  filename?: string;
  localMediaPath?: string | null;
  replyToWamid?: string;
}

// Unified outbound sender for Meta Cloud API accounts.
export async function sendWhatsAppMessage(
  account: WAAccount,
  params: SendParams
): Promise<{ wamid: string | null }> {
  await assertOrgCanSend(account.organizationId);
  if (!account.phoneNumberId || !account.accessToken) {
    throw new Error("Esta cuenta no tiene credenciales de Meta Cloud API configuradas");
  }

  const accessToken = decrypt(account.accessToken);
  const result = await sendMetaMessage(account.phoneNumberId, accessToken, {
    ...params,
    mediaId: params.mediaId ?? undefined,
  });
  return { wamid: result.messages[0]?.id ?? null };
}
