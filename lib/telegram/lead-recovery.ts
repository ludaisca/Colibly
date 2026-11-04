import { prisma } from "@/lib/prisma";
import { emitMessageSent } from "@/lib/events/message-sent";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { getPlatformApiKey, resolvePlatformModel } from "@/lib/ai/platform";
import { estimateCost } from "@/lib/ai/pricing";
import { generateRecoveryReply } from "@/lib/ai/recovery";
import type { WABot, ChannelAccount } from "@prisma/client";

const HISTORY_LIMIT = 12;

interface RecoveryConversation {
  id: string;
  externalId: string;
}

type RecoveryBot = WABot & { channelAccount: ChannelAccount | null };

// Hermano de lib/whatsapp/lead-recovery.ts:sendRecoveryMessage() — comparte
// el generador de mensaje vía lib/ai/recovery.ts, pero sin el chequeo de
// ventana de 24h de Meta (Telegram no impone esa restricción de plataforma).
export async function sendTelegramRecoveryMessage(
  conversation: RecoveryConversation,
  bot: RecoveryBot,
  attemptNumber: 1 | 2,
  now: Date
): Promise<void> {
  const channelAccount = bot.channelAccount;
  if (!channelAccount) {
    throw new Error(`Bot "${bot.name}" no tiene una cuenta de Telegram asociada`);
  }

  const picked = await resolvePlatformModel();
  if (!picked) {
    throw new Error(`Bot "${bot.name}" sin API key configurada — no se puede generar el mensaje de reactivación`);
  }
  const { provider, model } = picked;
  const apiKey = await getPlatformApiKey(provider);
  if (!apiKey) {
    throw new Error(`Bot "${bot.name}" sin API key configurada — no se puede generar el mensaje de reactivación`);
  }

  const rawHistory = await prisma.channelMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { timestamp: "desc" },
    take: HISTORY_LIMIT,
    select: { direction: true, body: true, caption: true },
  });

  const result = await generateRecoveryReply({
    systemPrompt: bot.systemPrompt,
    provider,
    apiKey,
    model: model,
    temperature: bot.temperature,
    maxTokens: bot.maxTokens,
    history: rawHistory.reverse().map((msg) => ({ direction: msg.direction, text: msg.caption ?? msg.body })),
    attemptNumber,
  });

  const sendResult = await sendTelegramMessage(channelAccount, {
    to: conversation.externalId,
    body: result.content,
  });

  const message = await prisma.channelMessage.create({
    data: {
      externalMessageId: sendResult.externalMessageId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sentVia: "recovery",
      messageType: "text",
      body: result.content,
      status: "sent",
      timestamp: now,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessage: result.content.slice(0, 500), lastMessageAt: now },
  });
  await emitMessageSent("channel", message.id, "recovery");

  const promptTokens = result.usage?.promptTokens ?? 0;
  const completionTokens = result.usage?.completionTokens ?? 0;
  const cost = result.usage
    ? await estimateCost(model, promptTokens, completionTokens, provider)
    : 0;

  await prisma.wALeadRecoveryAttempt.create({
    data: {
      conversationId: conversation.id,
      attemptNumber,
      channelMessageId: message.id,
      model: model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCost: cost,
    },
  });
}
