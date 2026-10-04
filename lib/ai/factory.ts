import type { AICompletionParams, AIProvider } from "./types";
import { curateModel } from "./platform";
import { createOpenCodeClient } from "./providers/opencode";
import { createGoogleClient } from "./providers/google";

function createClient(provider: AIProvider, apiKey: string) {
  switch (provider) {
    case "opencode":
      return createOpenCodeClient(apiKey);
    case "google":
      return createGoogleClient(apiKey);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

// Todo completion pasa por la lista curada: un bot con un modelo que ya no
// está en AI_MODELS corre con el recomendado de su proveedor (la IA la paga la
// plataforma; un modelo caro guardado de antes no debe colarse).
export function getAIProvider(provider: AIProvider, apiKey: string) {
  const client = createClient(provider, apiKey);
  return {
    ...client,
    complete: (params: AICompletionParams) => client.complete({ ...params, model: curateModel(provider, params.model) }),
  };
}

export function getEmbeddingModel(provider: AIProvider): string {
  switch (provider) {
    case "opencode":
      // Nunca debería llegar aquí — lib/ai/embeddings.ts redirige "opencode" a
      // "google" antes de resolver el modelo (OpenCode no tiene embeddings).
      throw new Error("OpenCode no soporta embeddings");
    case "google":
      // "text-embedding-004" was retired — gemini-embedding-2 is the current
      // model (see lib/ai/providers/google.ts for the 768-dim truncation via
      // outputDimensionality, needed since this defaults to 3072).
      return "gemini-embedding-2";
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}
