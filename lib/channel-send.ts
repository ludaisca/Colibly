import type { ChannelAccount } from "@prisma/client";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { sendGowaMessage } from "@/lib/gowa/send";
import { sendMetaChannelText } from "@/lib/meta-messaging/send";
import { assertOrgCanSend } from "@/lib/billing/gates";

// Texto plano por el canal de una cuenta genérica: el único punto donde el
// bot (lib/channels/bot-worker.ts, también sus fragmentos humanizados en
// bot-send-worker.ts) y la recuperación de leads (lib/channels/
// lead-recovery.ts) se bifurcan por canal. WEBCHAT no tiene API externa: el
// ChannelMessage OUTBOUND que se crea después de esta llamada YA es la
// entrega, el widget lo recoge por polling. Cada remitente llama
// assertOrgCanSend().
export async function sendChannelReplyText(
  channelAccount: ChannelAccount,
  to: string,
  body: string
): Promise<{ externalMessageId: string | null }> {
  switch (channelAccount.channel) {
    case "TELEGRAM":
      return sendTelegramMessage(channelAccount, { to, body });
    case "MESSENGER":
    case "INSTAGRAM":
      return sendMetaChannelText(channelAccount, { to, body });
    case "WHATSAPP_WEB":
      return sendGowaMessage(channelAccount, { to, body });
    case "WEBCHAT":
      await assertOrgCanSend(channelAccount.organizationId);
      return { externalMessageId: null };
  }
}
