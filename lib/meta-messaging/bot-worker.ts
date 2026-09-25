import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { sendMetaChannelText } from "@/lib/meta-messaging/send";
import { getAIProvider } from "@/lib/ai/factory";
import { searchKnowledge } from "@/lib/ai/rag";
import { getUserApiKey } from "@/lib/ai/settings";
import { wrapUserPrompt, SCOPE_GUARDRAIL } from "@/lib/ai/prompt-sanitizer";
import { isMonthlyBudgetExceeded } from "@/lib/ai/budget";
import { getBotSkipReason } from "@/lib/bots/guards";
import { recordBotUsage } from "@/lib/bots/usage";
import { resolveAbsolutePath } from "@/lib/whatsapp/media-store";
import { extractDocumentText } from "@/lib/whatsapp/extract-document-text";
import { splitReply, computeTypingDelay } from "@/lib/whatsapp/humanize";
import { botSendQueue } from "@/lib/queue";
import type { AIProvider, AIMessage, ContentPart } from "@/lib/ai/types";
import { BillingBlockedError, isBotWritable } from "@/lib/billing/gates";

// Compartido entre Messenger e Instagram (a diferencia de lib/telegram/
// bot-worker.ts, que es hermano deliberado de lib/workers/bot-worker.ts para
// no arriesgar el pipeline de WhatsApp ya estable en producción — ese riesgo
// no aplica aquí: Messenger e Instagram son código nuevo construido a la vez,
// y ambos hablan con la misma API (mismo Page Access Token, modelo
// Página-vinculada) así que no hay nada que bifurcar entre los dos más allá
// de qué ChannelAccount.channel trae el bot — send funciona igual para
// cualquiera de los dos). Algoritmo idéntico al de Telegram: prompt +
// guardrail, RAG, memoria, buildUserContent multimodal, texto de salida.
//
// Fuera de alcance por ahora (igual que Telegram): contexto de "última
// campaña" y envío de media de salida desde el bot — solo responde texto.
// humanizeEnabled funciona igual, vía botSendQueue con channel en el payload.

interface MetaChannelBotMessageJob {
  botId: string;
  conversationId: string;
  incomingMessage: string;
  messageId?: string;
  messageType?: string;
  mediaId?: string | null;
  localMediaPath?: string | null;
  mimeType?: string | null;
  caption?: string | null;
  filename?: string | null;
}

interface AttemptInfo {
  attemptsMade: number;
  maxAttempts: number;
}

export async function processMetaChannelBotMessageJob(
  job: MetaChannelBotMessageJob,
  attemptInfo: AttemptInfo = { attemptsMade: 0, maxAttempts: 1 }
) {
  // Cuenta en solo lectura (prueba vencida, impago): el bot no responde ni
  // gasta IA. No es un fallo del bot, así que no pasa a ERROR.
  if (!(await isBotWritable(job.botId))) {
    console.info(`[bots] ${job.botId}: organización en solo lectura, no se responde`);
    return;
  }
  try {
    await handleMetaChannelBotMessage(job);
  } catch (err) {
    if (err instanceof BillingBlockedError) return;
    console.error("[meta-messaging bot-worker] Error processing job:", err instanceof Error ? err.message : err);
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
    await sendMetaChannelText(bot.channelAccount, { to: conversation.externalId, body: FALLBACK_REPLY });

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
    console.error("[meta-messaging bot-worker] No se pudo enviar el mensaje de respaldo:", err instanceof Error ? err.message : err);
  }
}

async function handleMetaChannelBotMessage(job: MetaChannelBotMessageJob) {
  const { botId, conversationId, incomingMessage } = job;

  const bot = await prisma.wABot.findUnique({
    where: { id: botId },
    include: { channelAccount: true },
  });

  if (!bot || !bot.isActive || bot.status !== "ACTIVE" || !bot.channelAccount) return;

  const skipReason = await getBotSkipReason({ conversationId }, job.messageId);
  if (skipReason) {
    console.log(`[meta-messaging bot-worker] El bot "${bot.name}" no responde: ${skipReason}`);
    return;
  }

  if (await isMonthlyBudgetExceeded(bot.userId, new Date())) {
    console.log(`[meta-messaging bot-worker] Presupuesto mensual de IA superado — el bot "${bot.name}" no responde este mensaje`);
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

  const userContent = await buildUserContent(job, provider);
  messages.push({ role: "user", content: userContent });

  const client = getAIProvider(provider, apiKey);
  const result = await client.complete({
    model: bot.model,
    messages,
    temperature: bot.temperature,
    maxTokens: bot.maxTokens,
  });

  // El gasto de IA se registra en cuanto ocurre: si el envío de abajo falla y
  // BullMQ reintenta, esa llamada ya se hizo y debe contar en el presupuesto.
  await recordBotUsage({ botId, userId: bot.userId, model: bot.model, provider, usage: result.usage, conversationId }).catch((err) =>
    console.error("[meta-messaging bot-worker] No se pudo registrar el uso de IA:", err instanceof Error ? err.message : err)
  );

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { externalId: true },
  });
  if (!conversation) return;

  const replyText = result.content.trim();
  if (!replyText) {
    console.warn(`[meta-messaging bot-worker] El modelo devolvió una respuesta vacía — no se envía nada (conversación ${conversationId})`);
    return;
  }

  const now = new Date();

  // En cuanto la respuesta sale (primer fragmento encolado o envío directo),
  // un error posterior ya NO se relanza: BullMQ reintentaría el job completo
  // y el cliente recibiría la misma respuesta dos veces.
  let delivered = false;
  try {
    if (bot.humanizeEnabled) {
      // Mismo mecanismo que bot-worker.ts de WhatsApp: cada fragmento se encola
      // con un retraso acumulado en bot-message-send en vez de enviarse aquí,
      // para no retener el slot de concurrencia durante toda la secuencia.
      const chunks = splitReply(replyText);
      let cumulativeDelay = 0;
      for (const chunk of chunks) {
        cumulativeDelay += computeTypingDelay(chunk);
        await botSendQueue.add(
          "send-chunk",
          {
            channel: bot.channelAccount.channel,
            accountId: bot.channelAccount.id,
            waChatId: conversationId,
            remoteJid: conversation.externalId,
            chunk,
          },
          { delay: cumulativeDelay }
        );
        delivered = true;
      }
    } else {
      await sendMetaChannelText(bot.channelAccount, { to: conversation.externalId, body: replyText });
      delivered = true;

      await Promise.all([
        prisma.channelMessage.create({
          data: {
            conversationId,
            direction: "OUTBOUND",
            messageType: "text",
            body: replyText,
            status: "sent",
            timestamp: now,
          },
        }),
        prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessage: replyText.slice(0, 500), lastMessageAt: now },
        }),
      ]);
    }

    await Promise.all([
      bot.memoryType === "SUMMARY"
        ? prisma.wABotConversation.update({
            where: { id: botConversation.id },
            data: {
              summary: summarizeText(
                `Cliente: ${job.caption ?? incomingMessage}\nAsistente: ${replyText}`,
                botConversation.summary
              ),
            },
          })
        : Promise.resolve(),
      prisma.channelAccount.update({
        where: { id: bot.channelAccount.id },
        data: { lastActivity: now },
      }),
    ]);
  } catch (err) {
    if (!delivered) throw err;
    console.error(
      "[meta-messaging bot-worker] La respuesta ya se entregó; falló un paso posterior (no se reintenta para no duplicarla):",
      err instanceof Error ? err.message : err
    );
  }
}

// Port de lib/telegram/bot-worker.ts:buildUserContent() — idéntico, sobre
// las mismas tablas genéricas (ChannelMessage), los bytes de media ya están
// en disco vía lib/workers/media-worker.ts:processMetaChannelMediaDownload.
async function buildUserContent(job: MetaChannelBotMessageJob, provider: AIProvider): Promise<string | ContentPart[]> {
  const isImage = job.messageType === "image" || job.messageType === "sticker";
  const isAudio = job.messageType === "audio" && provider === "google";
  const isDocument = job.messageType === "document";
  const bodyText = job.caption ?? job.incomingMessage ?? "";
  const fallbackLabel = `[${job.messageType === "audio" ? "audio" : job.messageType} recibido]`;

  if (!isImage && !isAudio && !isDocument) {
    return bodyText || `[${job.messageType ?? "text"}]`;
  }

  let localPath = job.localMediaPath ?? null;
  let mimeType = job.mimeType ?? null;

  // El worker de descarga puede no haber terminado aún — re-chequear.
  if (!localPath && job.messageId) {
    const latest = await prisma.channelMessage.findUnique({
      where: { id: job.messageId },
      select: { mediaUrl: true, mimeType: true },
    }).catch(() => null);
    if (latest?.mediaUrl) localPath = latest.mediaUrl;
    if (latest?.mimeType) mimeType = latest.mimeType;
  }

  if (!localPath) {
    return bodyText && bodyText !== `[${job.messageType}]` ? `${fallbackLabel} ${bodyText}` : fallbackLabel;
  }
  const absolute = resolveAbsolutePath(localPath);

  if (isDocument) {
    const extracted = await extractDocumentText(absolute, mimeType);
    if (!extracted) {
      return bodyText && bodyText !== `[document]` ? `${fallbackLabel} ${bodyText}` : fallbackLabel;
    }
    const label = job.filename ? `Documento "${job.filename}"` : "Documento recibido";
    const caption = bodyText && bodyText !== `[document]` ? `\nMensaje del prospecto: ${bodyText}` : "";
    return `${label}, contenido extraído:\n\n${extracted}${caption}`;
  }

  try {
    const buffer = await fs.readFile(absolute);
    const base64 = buffer.toString("base64");
    const mime = mimeType ?? (isImage ? "image/jpeg" : "audio/ogg");

    const parts: ContentPart[] = [];
    if (bodyText && bodyText !== `[${job.messageType}]`) {
      parts.push({ type: "text", text: bodyText });
    }
    parts.push(
      isImage
        ? { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } }
        : { type: "audio_url", audio_url: { url: `data:${mime};base64,${base64}` } }
    );
    return parts;
  } catch (err) {
    console.error(`[meta-messaging bot-worker] No se pudo leer el ${isImage ? "imagen" : "audio"} local:`, err);
    return bodyText || fallbackLabel;
  }
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
