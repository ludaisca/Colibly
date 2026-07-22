import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { getAIProvider } from "@/lib/ai/factory";
import { searchKnowledge } from "@/lib/ai/rag";
import { getUserApiKey } from "@/lib/ai/settings";
import { estimateCost } from "@/lib/ai/pricing";
import { wrapUserPrompt, SCOPE_GUARDRAIL } from "@/lib/ai/prompt-sanitizer";
import { checkBudgetAlert, isMonthlyBudgetExceeded } from "@/lib/ai/budget";
import { splitReply, computeTypingDelay } from "@/lib/whatsapp/humanize";
import { botSendQueue } from "@/lib/queue";
import type { AIProvider, AIMessage } from "@/lib/ai/types";

// Hermano de lib/workers/bot-worker.ts, no una bifurcación dentro de él: ese
// archivo toca ~10 puntos acoplados a WAAccount/WAChat/WAMessage (historial,
// envío, persistencia, notificaciones) entrelazados a lo largo de toda la
// función — llenarlo de "if (channel === telegram)" dispersos arriesgaba el
// pipeline de WhatsApp en producción para poco beneficio real de compartir
// código. El algoritmo (prompt, guardrail, RAG, presupuesto, llamada a IA)
// es el mismo a propósito; el acceso a datos y el envío son los que difieren.
//
// Fuera de alcance por ahora: contexto de "última campaña" (Telegram no tiene
// campañas todavía), media multimodal de entrada hacia el modelo y envío de
// media de salida. humanizeEnabled sí funciona: reusa botSendQueue igual que
// WhatsApp, con el discriminador `channel` en el payload del job.

interface TelegramBotMessageJob {
  botId: string;
  conversationId: string;
  incomingMessage: string;
  messageId?: string;
  messageType?: string;
  mediaId?: string | null;
  mimeType?: string | null;
  caption?: string | null;
  filename?: string | null;
}

interface AttemptInfo {
  attemptsMade: number;
  maxAttempts: number;
}

export async function processTelegramBotMessageJob(
  job: TelegramBotMessageJob,
  attemptInfo: AttemptInfo = { attemptsMade: 0, maxAttempts: 1 }
) {
  try {
    await handleTelegramBotMessage(job);
  } catch (err) {
    console.error("[telegram bot-worker] Error processing job:", err instanceof Error ? err.message : err);
    const isLastAttempt = attemptInfo.attemptsMade + 1 >= attemptInfo.maxAttempts;
    if (!isLastAttempt) {
      throw err;
    }
    await failBotAndNotify(job.botId, job.conversationId, err instanceof Error ? err.message : "Error desconocido");
  }
}

const FALLBACK_REPLY =
  "Gracias por tu mensaje. Estamos teniendo un inconveniente técnico en este momento — un miembro de nuestro equipo te contactará en breve para continuar la conversación.";

async function failBotAndNotify(botId: string, conversationId: string, errorMessage: string) {
  const bot = await prisma.wABot
    .update({ where: { id: botId }, data: { status: "ERROR" } })
    .catch(() => null);
  if (bot?.channelAccountId) {
    await prisma.notification.create({
      data: {
        userId: bot.userId,
        type: "BOT_ERROR",
        title: `Bot "${bot.name}" con error`,
        body: errorMessage.slice(0, 200),
        link: `/whatsapp/chat/${bot.channelAccountId}/${conversationId}`,
      },
    });
  }
  await sendFallbackReply(botId, conversationId);
}

async function sendFallbackReply(botId: string, conversationId: string) {
  try {
    const bot = await prisma.wABot.findUnique({ where: { id: botId }, include: { channelAccount: true } });
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { externalId: true } });
    if (!bot?.channelAccount || !conversation) return;

    const now = new Date();
    await sendTelegramMessage(bot.channelAccount, { to: conversation.externalId, body: FALLBACK_REPLY });

    await Promise.all([
      prisma.channelMessage.create({
        data: {
          conversationId,
          direction: "OUTBOUND",
          messageType: "text",
          body: FALLBACK_REPLY,
          status: "sent",
          timestamp: now,
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessage: FALLBACK_REPLY.slice(0, 500), lastMessageAt: now },
      }),
    ]);
  } catch (err) {
    console.error("[telegram bot-worker] No se pudo enviar el mensaje de respaldo:", err instanceof Error ? err.message : err);
  }
}

async function handleTelegramBotMessage(job: TelegramBotMessageJob) {
  const { botId, conversationId, incomingMessage } = job;

  const bot = await prisma.wABot.findUnique({
    where: { id: botId },
    include: { channelAccount: true },
  });

  if (!bot || !bot.isActive || bot.status !== "ACTIVE" || !bot.channelAccount) return;

  if (await isMonthlyBudgetExceeded(bot.userId, new Date())) {
    console.log(`[telegram bot-worker] Presupuesto mensual de IA superado — el bot "${bot.name}" no responde este mensaje`);
    return;
  }

  const provider = bot.provider as AIProvider;
  const apiKey = await getUserApiKey(bot.userId, provider);

  if (!apiKey) {
    await failBotAndNotify(botId, conversationId, "Configura la clave del proveedor de IA en Configuración.");
    return;
  }

  let botConversation = await prisma.wABotConversation.findUnique({
    where: { botId_conversationId: { botId, conversationId } },
  });

  if (!botConversation) {
    botConversation = await prisma.wABotConversation.create({
      data: { botId, conversationId },
    });
  }

  const messages: AIMessage[] = [];
  messages.push({ role: "system", content: wrapUserPrompt(bot.systemPrompt) });
  messages.push({ role: "system", content: SCOPE_GUARDRAIL });

  if (bot.ragEnabled) {
    const ragQuery =
      job.caption ?? (incomingMessage && incomingMessage !== `[${job.messageType}]` ? incomingMessage : job.messageType ?? "");
    const knowledge = await searchKnowledge(botId, ragQuery, provider, apiKey);
    if (knowledge) {
      messages.push({
        role: "system",
        content: `Información relevante de la base de conocimiento:\n\n${knowledge}`,
      });
    }
  }

  if (bot.memoryType === "RECENT" && bot.memoryLimit > 0) {
    const history = await prisma.channelMessage.findMany({
      where: { conversationId, ...(job.messageId ? { id: { not: job.messageId } } : {}) },
      orderBy: { timestamp: "desc" },
      take: bot.memoryLimit * 2,
      select: { direction: true, body: true, messageType: true, caption: true },
    });

    for (const msg of history.reverse()) {
      const textPart = msg.caption ?? msg.body;
      if (!textPart) {
        if (msg.messageType && msg.messageType !== "text") {
          messages.push({ role: msg.direction === "INBOUND" ? "user" : "assistant", content: `[${msg.messageType}]` });
        }
        continue;
      }
      messages.push({ role: msg.direction === "INBOUND" ? "user" : "assistant", content: textPart });
    }
  }

  if (bot.memoryType === "SUMMARY" && botConversation.summary) {
    messages.push({
      role: "system",
      content: `Resumen de la conversación anterior:\n${botConversation.summary}`,
    });
  }

  // A diferencia de bot-worker.ts, no hay lectura de bytes de media local
  // (buildUserContent) — el bot de Telegram responde solo a partir del texto
  // recibido; la imagen/documento entrante ya se persistió y se puede ver en
  // el inbox, pero el modelo de IA aún no la recibe como input multimodal en
  // este canal (fuera de alcance, ver plan).
  const bodyText = job.caption ?? incomingMessage ?? "";
  messages.push({ role: "user", content: bodyText || `[${job.messageType ?? "text"}]` });

  const client = getAIProvider(provider, apiKey);
  const result = await client.complete({
    model: bot.model,
    messages,
    temperature: bot.temperature,
    maxTokens: bot.maxTokens,
  });

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { externalId: true },
  });
  if (!conversation) return;

  const now = new Date();

  if (bot.humanizeEnabled) {
    // Mismo mecanismo que bot-worker.ts de WhatsApp: cada fragmento se encola
    // con un retraso acumulado en bot-message-send en vez de enviarse aquí,
    // para no retener el slot de concurrencia durante toda la secuencia.
    const chunks = splitReply(result.content);
    let cumulativeDelay = 0;
    for (const chunk of chunks) {
      cumulativeDelay += computeTypingDelay(chunk);
      await botSendQueue.add(
        "send-chunk",
        {
          channel: "TELEGRAM",
          accountId: bot.channelAccount.id,
          waChatId: conversationId,
          remoteJid: conversation.externalId,
          chunk,
        },
        { delay: cumulativeDelay }
      );
    }
  } else {
    await sendTelegramMessage(bot.channelAccount, { to: conversation.externalId, body: result.content });

    await Promise.all([
      prisma.channelMessage.create({
        data: {
          conversationId,
          direction: "OUTBOUND",
          messageType: "text",
          body: result.content,
          status: "sent",
          timestamp: now,
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessage: result.content.slice(0, 500), lastMessageAt: now },
      }),
    ]);
  }

  await Promise.all([
    bot.memoryType === "SUMMARY"
      ? prisma.wABotConversation.update({
          where: { id: botConversation.id },
          data: {
            summary: summarizeText(
              `Cliente: ${job.caption ?? incomingMessage}\nAsistente: ${result.content}`,
              botConversation.summary
            ),
          },
        })
      : Promise.resolve(),
    prisma.channelAccount.update({
      where: { id: bot.channelAccount.id },
      data: { lastActivity: now },
    }),
    (async () => {
      if (!result.usage) return;
      const promptTokens = result.usage.promptTokens;
      const completionTokens = result.usage.completionTokens;
      const totalTokens = promptTokens + completionTokens;
      const cost = await estimateCost(bot.model, promptTokens, completionTokens, provider);

      await prisma.wABotUsage.create({
        data: {
          botId,
          conversationId,
          model: bot.model,
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCost: cost,
        },
      });

      await checkBudgetAlert(bot.userId, now);
    })(),
  ]);
}

function summarizeText(newMessage: string, existingSummary: string | null): string {
  const combined = existingSummary
    ? `${existingSummary}\n\n---\n\n${newMessage}`
    : newMessage;

  if (combined.length > 2000) {
    return combined.slice(combined.length - 2000);
  }

  return combined;
}
