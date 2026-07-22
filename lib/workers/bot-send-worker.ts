import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { sendTelegramMessage } from "@/lib/telegram/send";

interface BotSendJob {
  accountId: string;
  waChatId: string;
  remoteJid: string;
  chunk: string;
  // Presente solo en trabajos de Telegram — el payload de WhatsApp lo omite,
  // igual que el discriminador de la cola media-download.
  channel?: "TELEGRAM";
}

// Delivers one chunk of a "humanized" (split) bot reply — kept in its own queue/worker
// so the delayed sends don't hold a concurrency slot on the bot-messages queue, which
// would otherwise let a single humanized conversation block the other two bot jobs.
export async function processBotSendJob(job: BotSendJob) {
  if (job.channel === "TELEGRAM") {
    await processTelegramBotSendJob(job);
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
      },
    }),
  ]);
}

// Mismo flujo sobre las tablas del canal genérico: `waChatId` transporta el
// Conversation.id y `accountId` el ChannelAccount.id.
async function processTelegramBotSendJob(job: BotSendJob) {
  const account = await prisma.channelAccount.findUnique({ where: { id: job.accountId } });
  if (!account) return;

  const sendResult = await sendTelegramMessage(account, { to: job.remoteJid, body: job.chunk });

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
      },
    }),
  ]);
}
