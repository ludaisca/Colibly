import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/lib/ai/factory";
import { getPlatformApiKey, resolvePlatformModel } from "@/lib/ai/platform";
import { searchKnowledge } from "@/lib/ai/rag";
import { wrapUserPrompt, SCOPE_GUARDRAIL } from "@/lib/ai/prompt-sanitizer";
import { estimateCost } from "@/lib/ai/pricing";
import { AI_CREDITS_EXHAUSTED_MESSAGE, reserveAiCredit } from "@/lib/ai/credits";
import type { AIMessage } from "@/lib/ai/types";
import type { WABot } from "@prisma/client";

// Roadmap P3-d... P3-e (docs/ROADMAP_PANCAKE.md) — copiloto de IA: el bot
// sugiere un borrador que un agente humano revisa/edita/decide enviar desde
// el compositor del chat, distinto del WABot 100% autónomo de bot-worker.ts.
// Deliberadamente NO reutiliza handleBotMessage() (no exportado, y hace mucho
// más de lo que un borrador necesita: envía, persiste WAMessage, dispara la
// lógica de citas de IA) — esta función solo LEE la conversación y devuelve
// texto, sin ningún efecto secundario sobre el chat. Sí reusa el mismo tipo
// de gates (presupuesto, API key) y el mismo patrón de uso/costo que el resto
// de los consumidores de IA.
export class ReplySuggestionError extends Error {}

const COPILOT_INSTRUCTION = `Estás generando una SUGERENCIA de respuesta para que un agente humano la revise, edite y decida si la envía tal cual — no es un envío automático ni una decisión final tuya. Responde ÚNICAMENTE con el texto sugerido, en primera persona como si fueras el negocio respondiendo directo al cliente. No agregues comentarios, notas, ni explicaciones dirigidas al agente — solo el mensaje que el agente podría enviar.`;

interface HistoryMessage {
  direction: "INBOUND" | "OUTBOUND";
  body: string | null;
  caption: string | null;
  messageType: string | null;
}

// Compartido por ambos canales soportados hoy — mismo alcance que
// lib/whatsapp/lead-scoring.ts (WhatsApp + Telegram, no Messenger/Instagram
// todavía). El bot se recibe ya resuelto por el caller (no se filtra por
// isActive/status: a diferencia del reply autónomo, un bot pausado o nunca
// activado igual sirve como "persona" para una sugerencia manual).
export async function suggestReply(
  chatId: string,
  bot: WABot,
  channel: "WHATSAPP" | "TELEGRAM",
  // Quien pide la sugerencia: gasta sus créditos (regla 6 de las licencias).
  userId: string
): Promise<{ suggestion: string }> {
  const picked = await resolvePlatformModel();
  if (!picked) {
    throw new ReplySuggestionError("La IA no está disponible en este momento.");
  }
  const { provider, model } = picked;
  const apiKey = await getPlatformApiKey(provider);
  if (!apiKey) {
    throw new ReplySuggestionError("La IA no está disponible en este momento.");
  }
  if (!(await reserveAiCredit({ userId }))) {
    throw new ReplySuggestionError(AI_CREDITS_EXHAUSTED_MESSAGE);
  }

  const history: HistoryMessage[] = (
    channel === "TELEGRAM"
      ? await prisma.channelMessage.findMany({
          where: { conversationId: chatId },
          orderBy: { timestamp: "desc" },
          take: 40,
          select: { direction: true, body: true, caption: true, messageType: true },
        })
      : await prisma.wAMessage.findMany({
          where: { chatId },
          orderBy: { timestamp: "desc" },
          take: 40,
          select: { direction: true, body: true, caption: true, messageType: true },
        })
  ).reverse();

  if (history.length === 0) {
    throw new ReplySuggestionError("La conversación no tiene mensajes todavía.");
  }
  if (!history.some((m) => m.direction === "INBOUND")) {
    throw new ReplySuggestionError("El lead todavía no ha respondido — no hay nada que sugerir.");
  }

  const messages: AIMessage[] = [
    { role: "system", content: wrapUserPrompt(bot.systemPrompt) },
    { role: "system", content: SCOPE_GUARDRAIL },
    { role: "system", content: COPILOT_INSTRUCTION },
  ];

  if (bot.ragEnabled) {
    const lastInbound = [...history].reverse().find((m) => m.direction === "INBOUND");
    const ragQuery = lastInbound?.caption ?? lastInbound?.body ?? "";
    const knowledge = ragQuery ? await searchKnowledge(bot.id, ragQuery, provider, apiKey) : null;
    if (knowledge) {
      messages.push({ role: "system", content: `Información relevante de la base de conocimiento:\n\n${knowledge}` });
    }
  }

  for (const msg of history) {
    const text = msg.caption ?? msg.body;
    if (!text) {
      if (msg.messageType && msg.messageType !== "text") {
        messages.push({ role: msg.direction === "INBOUND" ? "user" : "assistant", content: `[${msg.messageType}]` });
      }
      continue;
    }
    messages.push({ role: msg.direction === "INBOUND" ? "user" : "assistant", content: text });
  }

  const client = getAIProvider(provider, apiKey);
  const result = await client.complete({
    model: model,
    messages,
    temperature: bot.temperature,
    maxTokens: bot.maxTokens,
  });

  if (result.usage) {
    const promptTokens = result.usage.promptTokens;
    const completionTokens = result.usage.completionTokens;
    const cost = await estimateCost(model, promptTokens, completionTokens, provider);

    await prisma.wABotUsage.create({
      data: {
        botId: bot.id,
        ...(channel === "TELEGRAM" ? { conversationId: chatId } : { waChatId: chatId }),
        model: model,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCost: cost,
      },
    });

  }

  return { suggestion: result.content.trim() };
}
