import type { AIProvider } from "./types";
import { AI_MODELS, DEFAULT_AI_MODEL, isCuratedModel, type AiModelOption } from "@/lib/billing/plans";
import { getPlatformSettings } from "@/lib/platform-settings";

// La IA la provee la plataforma: una key por proveedor y el modelo elegido,
// configurados desde /plataforma. El cliente no elige proveedor ni modelo;
// solo ve sus créditos consumidos (lib/ai/credits.ts).

const OPENCODE_MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,80}$/;
// Ids de Google colados en el campo de OpenCode: se guardaron por API antes de
// que el PATCH los validara. En OpenCode no existen, así que se cae al
// recomendado en vez de fallar en cada respuesta.
const GOOGLE_MODEL_ID = /^gemini[-.]/i;

export function normalizeOpenCodeModel(model: string): string {
  const bare = model.replace(/^opencode-go\//, "");
  if (GOOGLE_MODEL_ID.test(bare)) return DEFAULT_AI_MODEL.opencode;
  return OPENCODE_MODEL_ID.test(bare) ? bare : DEFAULT_AI_MODEL.opencode;
}

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
  if (provider === "opencode") return normalizeOpenCodeModel(model);
  return isCuratedModel(provider, model) ? model : DEFAULT_AI_MODEL[provider];
}

// Revalida una combinación ya guardada (p. ej. en un PATCH que no la toca):
// null = sigue siendo válida. Ya no valida entrada de formulario — el cliente
// no envía provider/model, ver pickCuratedModel().
export async function modelChoiceError(provider: string, model: string): Promise<string | null> {
  if (provider !== "opencode" && provider !== "google") return "Proveedor de IA inválido";
  if (!(await getPlatformApiKey(provider))) return "Ese proveedor de IA no está disponible";
  if (provider === "opencode") {
    if (!OPENCODE_MODEL_ID.test(model.replace(/^opencode-go\//, ""))) return "Elige uno de los modelos disponibles";
    return null;
  }
  if (!isCuratedModel(provider, model)) return "Elige uno de los modelos disponibles";
  return null;
}

// OpenCode es el proveedor por defecto: la suscripción es plana y cada crédito
// extra no se cobra por token. Gemini solo entra si OpenCode no tiene llave, o
// si la llamada trae audio (el modelo de OpenCode no acepta audio).
export interface ModelPrefs {
  text?: string | null;
  vision?: string | null;
}

export function selectCuratedModel(
  enabled: ReadonlySet<AIProvider>,
  opts: { needsVision?: boolean; needsAudio?: boolean } = {},
  prefs: ModelPrefs = {},
): { provider: AIProvider; model: string } | null {
  if (opts.needsAudio && enabled.has("google")) {
    return { provider: "google", model: DEFAULT_AI_MODEL.google };
  }
  if (enabled.has("opencode")) {
    const chosen = opts.needsVision ? prefs.vision || prefs.text : prefs.text;
    return { provider: "opencode", model: chosen ? normalizeOpenCodeModel(chosen) : DEFAULT_AI_MODEL.opencode };
  }
  const google = AI_MODELS.find((m) => m.provider === "google" && enabled.has("google") && (!opts.needsVision || m.vision));
  return google ? { provider: "google", model: google.id } : null;
}

async function modelPrefs(): Promise<ModelPrefs> {
  const settings = await getPlatformSettings();
  return { text: settings.aiTextModel, vision: settings.aiVisionModel };
}

// El modelo que eligió el operador en /plataforma. `needsVision` para una
// imagen; `needsAudio` para una nota de voz (Gemini). null = ningún proveedor
// está configurado.
export async function resolvePlatformModel(opts: { needsVision?: boolean; needsAudio?: boolean } = {}): Promise<{ provider: AIProvider; model: string } | null> {
  return selectCuratedModel(new Set(await enabledProviders()), opts, await modelPrefs());
}

export async function pickCuratedModel(needsVision: boolean): Promise<{ provider: AIProvider; model: string } | null> {
  return resolvePlatformModel({ needsVision });
}
