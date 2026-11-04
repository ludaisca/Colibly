import { prisma } from "@/lib/prisma";
import { emitMessageSent } from "@/lib/events/message-sent";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { getPlatformApiKey, resolvePlatformModel } from "@/lib/ai/platform";
import { estimateCost } from "@/lib/ai/pricing";
import { generateRecoveryReply } from "@/lib/ai/recovery";
import type { WABot, WAAccount } from "@prisma/client";

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 12;

// Meta's 24h customer-service window closes based on the LEAD's last inbound
// message, not our last outbound — this is checked live, right before every
// send, as a safety net. With the current default thresholds (2h/12h) this
// should never actually trip, but if the config is ever loosened past 24h,
// this is what stops a free-text send from violating Meta's policy instead
// of silently failing at Meta's end.
// Exportado: lib/sequences.ts (roadmap P3-a) reutiliza esta misma regla antes
// de mandar el paso de una secuencia por WhatsApp — el límite de Meta no es
// específico de la recuperación de leads, aplica a cualquier envío de texto
// libre iniciado por el sistema.
export function isWithinServiceWindow(lastInboundAt: Date, now: Date): boolean {
  return now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}

// Pura y compartida: vive en lib/dates/business-hours.ts.
export { isWithinBusinessHours } from "@/lib/dates/business-hours";

interface RecoveryChat {
  id: string;
  remoteJid: string;
}

type RecoveryBot = WABot & { waAccount: WAAccount | null };

// Generates (via the same bot that already talks to this lead) and sends a
// reactivation message, then logs it as a WAMessage + WALeadRecoveryAttempt.
// Throws on failure — the caller (the tick worker) catches per-chat so one
// bad send doesn't abort the whole batch.
export async function sendRecoveryMessage(
  chat: RecoveryChat,
  bot: RecoveryBot,
  attemptNumber: 1 | 2,
  lastInboundAt: Date,
  now: Date
): Promise<void> {
  if (!isWithinServiceWindow(lastInboundAt, now)) {
    throw new Error(
      `Ventana de 24h de Meta ya cerrada para el chat ${chat.id} — se omite el mensaje de reactivación (no hay plantilla configurada todavía)`
    );
  }

  const waAccount = bot.waAccount;
  if (!waAccount) {
    throw new Error(`Bot "${bot.name}" no tiene una cuenta de WhatsApp asociada`);
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

  const rawHistory = await prisma.wAMessage.findMany({
    where: { chatId: chat.id },
    orderBy: { timestamp: "desc" },
    take: HISTORY_LIMIT,
    select: { direction: true, body: true, caption: true, messageType: true },
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

  const sendResult = await sendWhatsAppMessage(waAccount, {
    to: chat.remoteJid,
    type: "text",
    body: result.content,
  });

  const message = await prisma.wAMessage.create({
    data: {
      wamid: sendResult.wamid ?? undefined,
      chatId: chat.id,
      direction: "OUTBOUND",
      sentVia: "recovery",
      messageType: "text",
      body: result.content,
      status: "sent",
      timestamp: now,
    },
  });

  await prisma.wAChat.update({
    where: { id: chat.id },
    data: { lastMessage: result.content.slice(0, 500), lastMessageAt: now },
  });
  await emitMessageSent("whatsapp", message.id, "recovery");

  const promptTokens = result.usage?.promptTokens ?? 0;
  const completionTokens = result.usage?.completionTokens ?? 0;
  const cost = result.usage
    ? await estimateCost(model, promptTokens, completionTokens, provider)
    : 0;

  await prisma.wALeadRecoveryAttempt.create({
    data: {
      chatId: chat.id,
      attemptNumber,
      messageId: message.id,
      model: model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCost: cost,
    },
  });
}
