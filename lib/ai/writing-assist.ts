import { getAIProvider } from "@/lib/ai/factory";
import { getPlatformApiKey, pickCuratedModel } from "@/lib/ai/platform";
import { reserveAiCredit } from "@/lib/ai/credits";

export class WritingAssistError extends Error {}

async function complete(organizationId: string, system: string, user: string, maxTokens: number): Promise<string> {
  const picked = await pickCuratedModel(false);
  if (!picked) throw new WritingAssistError("La IA no está disponible en este momento.");
  const apiKey = await getPlatformApiKey(picked.provider);
  if (!apiKey) throw new WritingAssistError("La IA no está disponible en este momento.");
  if (!(await reserveAiCredit(organizationId))) throw new WritingAssistError("Se acabaron los créditos de IA de este mes.");
  const client = getAIProvider(picked.provider, apiKey);
  const result = await client.complete({
    model: picked.model,
    temperature: 0.4,
    maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const text = result.content.trim();
  if (!text) throw new WritingAssistError("La IA no devolvió un texto.");
  return text;
}

export function rewriteDraft(organizationId: string, draft: string): Promise<string> {
  return complete(
    organizationId,
    "Reescribes un borrador de un negocio a su cliente. Conserva precios, fechas y nombres. Devuelve solo el mensaje, en el mismo idioma, listo para enviar. Sin comillas ni notas.",
    draft.slice(0, 2000),
    800
  );
}

export function suggestTaskTitle(organizationId: string, transcript: string): Promise<string> {
  return complete(
    organizationId,
    "Propones UNA tarea concreta para el equipo a partir de la conversación. Devuelve solo el título, en español, máximo 120 caracteres, sin comillas.",
    transcript.slice(0, 4000),
    80
  );
}
