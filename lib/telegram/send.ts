import type { ChannelAccount } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { sendTextMessage } from "@/lib/telegram";

interface SendParams {
  to: string;
  body: string;
}

// Unified outbound sender for Telegram accounts — paralelo a
// lib/whatsapp/send.ts:sendWhatsAppMessage. Solo texto por ahora.
export async function sendTelegramMessage(
  account: ChannelAccount,
  params: SendParams
): Promise<{ externalMessageId: string | null }> {
  const { botToken } = JSON.parse(decrypt(account.credentials)) as { botToken: string };
  const result = await sendTextMessage(botToken, params.to, params.body);
  return { externalMessageId: String(result.message_id) };
}
