import type { AIProvider } from "./types";
import { AI_MODELS, DEFAULT_AI_MODEL, isCuratedModel, type AiModelOption } from "@/lib/billing/plans";
import { getPlatformSettings } from "@/lib/platform-settings";

// La IA la provee la plataforma: una key por proveedor, configurada desde
// /plataforma (PlatformSettings.opencodeApiKey/googleApiKey). El cliente no
// solo no configura keys — tampoco elige proveedor ni modelo (ver
// pickCuratedModel() abajo): eso es enteramente responsabilidad de la
// plataforma, el cliente solo ve sus créditos consumidos (lib/ai/credits.ts).

export async function getPlatformApiKey(provider: AIProvider): Promise<string | null> {
  const settings = await getPlatformSettings();
  return provider === "opencode" ? settings.opencodeApiKey : settings.googleApiKey;
}

export async function enabledProviders(): Promise<AIProvider[]> {
  const providers = ["opencode", "google"] as const;
  const keys = await Promise.all(providers.map((p) => getPlatformApiKey(p)));
  return providers.filter((_, i) => !!keys[i]);
}

export async function availableModels(): Promise<AiModelOption[]> {
  const enabled = new Set(await enabledProviders());
  return AI_MODELS.filter((m) => enabled.has(m.provider));
}

// Un modelo guardado que ya no está en la lista (bots viejos, un modelo que se
// retiró) corre con el recomendado de su proveedor en vez de fallar.
export function curateModel(provider: AIProvider, model: string): string {
  return isCuratedModel(provider, model) ? model : DEFAULT_AI_MODEL[provider];
}

// Revalida una combinación ya guardada (p. ej. en un PATCH que no la toca):
// null = sigue siendo válida. Ya no valida entrada de formulario — el cliente
// no envía provider/model, ver pickCuratedModel().
export async function modelChoiceError(provider: string, model: string): Promise<string | null> {
  if (provider !== "opencode" && provider !== "google") return "Proveedor de IA inválido";
  if (!(await getPlatformApiKey(provider))) return "Ese proveedor de IA no está disponible";
  if (!isCuratedModel(provider, model)) return "Elige uno de los modelos disponibles";
  return null;
}

// Asigna sola un modelo curado de un proveedor habilitado — el cliente nunca
// elige. `needsVision: true` para bots (pueden recibir imágenes en WhatsApp/
// Telegram); `false` para calificadores/pasos de automatización (solo texto).
// null = ningún proveedor de IA está configurado en /plataforma.
export async function pickCuratedModel(needsVision: boolean): Promise<{ provider: AIProvider; model: string } | null> {
  const enabled = new Set(await enabledProviders());
  const candidate = AI_MODELS.find((m) => enabled.has(m.provider) && (!needsVision || m.vision));
  return candidate ? { provider: candidate.provider, model: candidate.id } : null;
}
