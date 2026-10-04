import { getAIProvider, getEmbeddingModel } from "./factory";
import { getPlatformApiKey } from "./platform";
import type { AIProvider } from "./types";

// OpenCode no tiene endpoint de embeddings — un bot que responde con OpenCode
// sigue pudiendo usar RAG porque los embeddings se generan con Google por
// debajo. Requiere la API key de Google configurada en /plataforma además de
// la de OpenCode.
async function resolveEmbeddingProvider(provider: AIProvider, apiKey: string): Promise<{ provider: AIProvider; apiKey: string }> {
  if (provider !== "opencode") return { provider, apiKey };
  const googleKey = await getPlatformApiKey("google");
  if (!googleKey) throw new Error("RAG requiere la API key de Google configurada en /plataforma (OpenCode no soporta embeddings)");
  return { provider: "google", apiKey: googleKey };
}

export async function generateEmbedding(
  text: string,
  provider: AIProvider,
  apiKey: string
): Promise<number[]> {
  const resolved = await resolveEmbeddingProvider(provider, apiKey);
  const client = getAIProvider(resolved.provider, resolved.apiKey);
  const model = getEmbeddingModel(resolved.provider);
  const res = await client.generateEmbeddings({ model, input: text });
  return res.embeddings[0];
}

export async function generateEmbeddings(
  texts: string[],
  provider: AIProvider,
  apiKey: string
): Promise<number[][]> {
  const resolved = await resolveEmbeddingProvider(provider, apiKey);
  const client = getAIProvider(resolved.provider, resolved.apiKey);
  const model = getEmbeddingModel(resolved.provider);
  const res = await client.generateEmbeddings({ model, input: texts });
  return res.embeddings;
}
