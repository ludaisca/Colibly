import OpenAI from "openai";
import { AI_REQUEST_TIMEOUT_MS } from "@/lib/http-timeouts";
import type { AICompletionParams, AICompletionResponse, AIEmbeddingParams, AIEmbeddingResponse } from "../types";

// OpenCode Go (opencode.ai/docs/go) — suscripción plana que da acceso a modelos
// open-source (GLM, Kimi, DeepSeek, MiMo, LongCat) vía el mismo shape de
// chat.completions que ya soporta el SDK `openai`. Solo el grupo de modelos
// "chat/completions" de Go está soportado aquí — los grupos /v1/responses y
// /v1/messages usan un formato distinto y no están cableados.
const BASE_URL = "https://opencode.ai/zen/go/v1";

export function createOpenCodeClient(apiKey: string) {
  const client = new OpenAI({ baseURL: BASE_URL, apiKey, timeout: AI_REQUEST_TIMEOUT_MS, maxRetries: 1 });

  async function complete(params: AICompletionParams): Promise<AICompletionResponse> {
    const res = await client.chat.completions.create({
      model: params.model,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as never,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 1024,
    });

    return {
      content: res.choices[0]?.message?.content ?? "",
      usage: res.usage
        ? { promptTokens: res.usage.prompt_tokens, completionTokens: res.usage.completion_tokens }
        : undefined,
    };
  }

  // OpenCode Go no expone un endpoint de embeddings — lib/ai/embeddings.ts
  // redirige a Google antes de llegar aquí, así que esto nunca debería llamarse.
  async function generateEmbeddings(_params: AIEmbeddingParams): Promise<AIEmbeddingResponse> {
    throw new Error("OpenCode no soporta embeddings — usa el fallback a Google en lib/ai/embeddings.ts");
  }

  return { complete, generateEmbeddings };
}
