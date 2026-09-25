import type { AIProvider } from "./types";
import { AI_MODELS, DEFAULT_AI_MODEL, isCuratedModel, type AiModelOption } from "@/lib/billing/plans";

// La IA la provee la plataforma: una key por proveedor en variables de entorno
// (PLATFORM_OPENROUTER_API_KEY, PLATFORM_GOOGLE_API_KEY). Los clientes no
// configuran keys; eligen entre los modelos de AI_MODELS y consumen créditos
// (lib/ai/credits.ts).

export function getPlatformApiKey(provider: AIProvider): string | null {
  const key = provider === "openrouter" ? process.env.PLATFORM_OPENROUTER_API_KEY : process.env.PLATFORM_GOOGLE_API_KEY;
  return key?.trim() || null;
}

export function enabledProviders(): AIProvider[] {
  return (["openrouter", "google"] as const).filter((p) => !!getPlatformApiKey(p));
}

export function availableModels(): AiModelOption[] {
  const enabled = new Set(enabledProviders());
  return AI_MODELS.filter((m) => enabled.has(m.provider));
}

// Un modelo guardado que ya no está en la lista (bots viejos, un modelo que se
// retiró) corre con el recomendado de su proveedor en vez de fallar.
export function curateModel(provider: AIProvider, model: string): string {
  return isCuratedModel(provider, model) ? model : DEFAULT_AI_MODEL[provider];
}

// Para validar lo que llega de un formulario: proveedor habilitado y modelo de la lista.
export function modelChoiceError(provider: string, model: string): string | null {
  if (provider !== "openrouter" && provider !== "google") return "Proveedor de IA inválido";
  if (!getPlatformApiKey(provider)) return "Ese proveedor de IA no está disponible";
  if (!isCuratedModel(provider, model)) return "Elige uno de los modelos disponibles";
  return null;
}
