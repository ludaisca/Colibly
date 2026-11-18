import { prisma } from "@/lib/prisma";
import { emitMessageSent } from "@/lib/events/message-sent";
import { sendChannelReplyText } from "@/lib/channel-send";
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

/**
 * Canales genéricos que reciben recuperación de leads. El chat web no tiene a
 * quién escribirle si el visitante se fue, y WhatsApp por QR nunca se usa
 * para mensajes no pedidos (riesgo de bloqueo del número).
 */
export const RECOVERY_CHANNELS = ["TELEGRAM", "MESSENGER", "INSTAGRAM"] as const;

// Hermano de lib/whatsapp/lead-recovery.ts:sendRecoveryMessage() — comparte
// el generador de mensaje vía lib/ai/recovery.ts, pero sin el chequeo de
// ventana de 24h de Meta: ni Telegram ni Messenger/Instagram (páginas ya
// conectadas) la imponen. El envío se bifurca por canal en
// lib/channel-send.ts. Hasta 2026-11-17 Messenger/Instagram tenían una copia
// propia (lib/meta-messaging/lead-recovery.ts) que solo cambiaba esa llamada.
export async function sendChannelRecoveryMessage(
  conversation: RecoveryConversation,
  bot: RecoveryBot,
  attemptNumber: 1 | 2,
  now: Date
): Promise<void> {
  const channelAccount = bot.channelAccount;
  if (!channelAccount) {
    throw new Error(`Bot "${bot.name}" no tiene una cuenta de canal asociada`);
  }
  // Antes de gastar IA: un canal sin recuperación no debe llegar aquí.
  if (!(RECOVERY_CHANNELS as readonly string[]).includes(channelAccount.channel)) {
    throw new Error(`La recuperación de leads no aplica al canal ${channelAccount.channel}`);
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

  const sendResult = await sendChannelReplyText(channelAccount, conversation.externalId, result.content);

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
