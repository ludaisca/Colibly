import type { ChannelAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { sendMetaChannelText } from "@/lib/meta-messaging/send";
import { assertOrgCanSend, isAccountWritable } from "@/lib/billing/gates";

interface BotSendJob {
  accountId: string;
  waChatId: string;
  remoteJid: string;
  chunk: string;
  // Presente solo en trabajos de canales no-WhatsApp — el payload de
  // WhatsApp lo omite, igual que el discriminador de la cola media-download.
  channel?: "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";
}

// Delivers one chunk of a "humanized" (split) bot reply — kept in its own queue/worker
// so the delayed sends don't hold a concurrency slot on the bot-messages queue, which
// would otherwise let a single humanized conversation block the other two bot jobs.
export async function processBotSendJob(job: BotSendJob) {
  if (!(await isAccountWritable(job.channel ? { channelAccountId: job.accountId } : { waAccountId: job.accountId }))) return;
  if (job.channel === "TELEGRAM" || job.channel === "MESSENGER" || job.channel === "INSTAGRAM" || job.channel === "WEBCHAT") {
    await processChannelBotSendJob(job);
    return;
  }

  const account = await prisma.wAAccount.findUnique({ where: { id: job.accountId } });
  if (!account) return;

  const sendResult = await sendWhatsAppMessage(account, {
    to: job.remoteJid,
    type: "text",
    body: job.chunk,
  });

  const now = new Date();

  await Promise.all([
    prisma.wAMessage.create({
      data: {
        wamid: sendResult.wamid ?? undefined,
        chatId: job.waChatId,
        direction: "OUTBOUND",
        messageType: "text",
        body: job.chunk,
        status: "sent",
        timestamp: now,
      },
    }),
    prisma.wAChat.update({
      where: { id: job.waChatId },
      data: {
        lastMessage: job.chunk.slice(0, 500),
        lastMessageAt: now,
        // Respuesta del bot (fragmento humanizado): ver lib/chats/waiting.ts.
        waitingSince: null,
      },
    }),
  ]);
}

// Compartido por Telegram/Messenger/Instagram — mismas tablas genéricas
// (`waChatId` transporta el Conversation.id, `accountId` el ChannelAccount.id),
// solo difiere qué cliente de envío se usa según account.channel.
async function processChannelBotSendJob(job: BotSendJob) {
  const account = await prisma.channelAccount.findUnique({ where: { id: job.accountId } });
  if (!account) return;

  const sendResult = await sendChannelChunk(account, job.remoteJid, job.chunk);

  const now = new Date();

  await Promise.all([
    prisma.channelMessage.create({
      data: {
        externalMessageId: sendResult.externalMessageId,
        conversationId: job.waChatId,
        direction: "OUTBOUND",
        messageType: "text",
        body: job.chunk,
        status: "sent",
        timestamp: now,
      },
    }),
    prisma.conversation.update({
      where: { id: job.waChatId },
      data: {
        lastMessage: job.chunk.slice(0, 500),
        lastMessageAt: now,
        // Respuesta del bot (fragmento humanizado): ver lib/chats/waiting.ts.
        waitingSince: null,
      },
    }),
  ]);
}

function sendChannelChunk(account: ChannelAccount, to: string, body: string): Promise<{ externalMessageId: string | null }> {
  if (account.channel === "TELEGRAM") return sendTelegramMessage(account, { to, body });
  // WEBCHAT (roadmap P3-f): no hay ninguna API externa a la que llamar — el
  // ChannelMessage OUTBOUND creado justo abajo YA es la entrega, el widget
  // lo recoge por polling.
  if (account.channel === "WEBCHAT") return assertOrgCanSend(account.organizationId).then(() => ({ externalMessageId: null }));
  return sendMetaChannelText(account, { to, body });
}
