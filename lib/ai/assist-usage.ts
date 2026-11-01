import type { AiAssistKind } from "@prisma/client";
import type { AIProvider } from "@/lib/ai/types";
import { estimateCost } from "@/lib/ai/pricing";
import { prisma } from "@/lib/prisma";

// Registra una llamada de IA de asistencia (reescribir, tarea, transcribir,
// monitores). Nunca lanza: el crédito ya se reservó y la respuesta ya se
// obtuvo; perder la fila de costo no debe romper la acción del usuario.
export async function recordAssistUsage(input: {
  organizationId: string;
  kind: AiAssistKind;
  userId?: string | null;
  provider: AIProvider;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}): Promise<void> {
  try {
    const promptTokens = input.usage?.promptTokens ?? 0;
    const completionTokens = input.usage?.completionTokens ?? 0;
    await prisma.aiAssistUsage.create({
      data: {
        organizationId: input.organizationId,
        kind: input.kind,
        userId: input.userId ?? null,
        model: input.model,
        promptTokens,
        completionTokens,
        estimatedCost: await estimateCost(input.model, promptTokens, completionTokens, input.provider),
      },
    });
  } catch (error) {
    console.error(`[ai] no se pudo registrar el uso de asistencia (${input.kind})`, error);
  }
}
