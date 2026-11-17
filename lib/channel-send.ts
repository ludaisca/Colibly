import type { ChannelAccount } from "@prisma/client";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { sendGowaMessage } from "@/lib/gowa/send";
import { assertOrgCanSend } from "@/lib/billing/gates";

// Roadmap P3-f — lib/telegram/bot-worker.ts se reutiliza tal cual para
// WEBCHAT (mismo perfil simple: texto plano, sin medios, sin ventana de
// servicio) en vez de escribir un cuarto bot-worker desde cero. La única
// diferencia real de envío es que WEBCHAT no tiene ninguna API externa a la
// que llamar — el ChannelMessage OUTBOUND que el bot-worker crea después de
// esta llamada YA es la entrega, el widget lo recoge por polling. Este
// helper centraliza esa bifurcación en los puntos de envío del bot-worker.
export async function sendChannelReplyText(
  channelAccount: ChannelAccount,
  to: string,
  body: string
): Promise<{ externalMessageId: string | null }> {
  await assertOrgCanSend(channelAccount.organizationId);
  if (channelAccount.channel === "WEBCHAT") {
    return { externalMessageId: null };
  }
  if (channelAccount.channel === "WHATSAPP_WEB") {
    return sendGowaMessage(channelAccount, { to, body });
  }
  return sendTelegramMessage(channelAccount, { to, body });
}
