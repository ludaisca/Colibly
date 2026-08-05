import { prisma } from "@/lib/prisma";
import { sendMetaChannelText } from "@/lib/meta-messaging/send";
import { getUserApiKey } from "@/lib/ai/settings";
import { estimateCost } from "@/lib/ai/pricing";
import { generateRecoveryReply } from "@/lib/ai/recovery";
import type { AIProvider } from "@/lib/ai/types";
import type { WABot, ChannelAccount } from "@prisma/client";

const HISTORY_LIMIT = 12;

interface RecoveryConversation {
  id: string;
  externalId: string;
}

type RecoveryBot = WABot & { channelAccount: ChannelAccount | null };

// Hermano de lib/telegram/lead-recovery.ts:sendTelegramRecoveryMessage() —
// mismo generador de mensaje (lib/ai/recovery.ts) y misma ausencia de ventana
// de 24h (ni Messenger ni Instagram la imponen para páginas ya conectadas),
// pero envía por lib/meta-messaging/send.ts:sendMetaChannelText en vez de la
// API de Telegram. Antes de que existiera este archivo, lead-recovery-worker.ts
// llamaba sendTelegramRecoveryMessage() incondicionalmente para cualquier
// ChannelAccount no-WhatsApp, incluidas cuentas de Messenger/Instagram — con
// credentials sin `botToken`, esa llamada fallaba en silencio (catch + log)
// y la recuperación de leads nunca funcionaba para esos dos canales.
export async function sendMetaChannelRecoveryMessage(
  conversation: RecoveryConversation,
  bot: RecoveryBot,
  attemptNumber: 1 | 2,
  now: Date
): Promise<void> {
  const channelAccount = bot.channelAccount;
  if (!channelAccount) {
    throw new Error(`Bot "${bot.name}" no tiene una cuenta de Messenger/Instagram asociada`);
  }

  const provider = bot.provider as AIProvider;
  const apiKey = await getUserApiKey(bot.userId, provider);
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
    model: bot.model,
    temperature: bot.temperature,
    maxTokens: bot.maxTokens,
    history: rawHistory.reverse().map((msg) => ({ direction: msg.direction, text: msg.caption ?? msg.body })),
    attemptNumber,
  });

  const sendResult = await sendMetaChannelText(channelAccount, {
    to: conversation.externalId,
    body: result.content,
  });

  const message = await prisma.channelMessage.create({
    data: {
      externalMessageId: sendResult.externalMessageId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
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

  const promptTokens = result.usage?.promptTokens ?? 0;
  const completionTokens = result.usage?.completionTokens ?? 0;
  const cost = result.usage
    ? await estimateCost(bot.model, promptTokens, completionTokens, provider)
    : 0;

  await prisma.wALeadRecoveryAttempt.create({
    data: {
      conversationId: conversation.id,
      attemptNumber,
      channelMessageId: message.id,
      model: bot.model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCost: cost,
    },
  });
}
