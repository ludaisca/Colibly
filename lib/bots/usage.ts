import { prisma } from "@/lib/prisma";
import { estimateCost } from "@/lib/ai/pricing";
import type { AIProvider } from "@/lib/ai/types";

// Registra el costo de UNA llamada de IA de un bot justo después de hacerla —
// antes se registraba al final del job, así que si el envío fallaba (y BullMQ
// reintentaba llamando otra vez a la IA) ese gasto nunca se contaba en el
// presupuesto mensual.
export async function recordBotUsage(params: {
  botId: string;
  userId: string;
  model: string;
  provider: AIProvider;
  usage: { promptTokens: number; completionTokens: number } | undefined;
  waChatId?: string;
  conversationId?: string;
}): Promise<void> {
  if (!params.usage) return;
  const { promptTokens, completionTokens } = params.usage;
  const estimatedCost = await estimateCost(params.model, promptTokens, completionTokens, params.provider);
  await prisma.wABotUsage.create({
    data: {
      botId: params.botId,
      ...(params.waChatId ? { waChatId: params.waChatId } : {}),
      ...(params.conversationId ? { conversationId: params.conversationId } : {}),
      model: params.model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCost,
    },
  });
}
