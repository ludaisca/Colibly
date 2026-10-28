import { randomUUID } from "crypto";
import OpenAI from "openai";
import { AI_REQUEST_TIMEOUT_MS } from "@/lib/http-timeouts";
import type { AICompletionParams, AICompletionResponse, AIEmbeddingParams, AIEmbeddingResponse } from "../types";

// OpenCode Go (opencode.ai/docs/go) — suscripción plana. El grupo cableado es
// chat.completions en el endpoint actual; /v1/responses y /v1/messages no.
// Go rechaza la llamada si falta x-opencode-session.
export const OPENCODE_API_BASE = "https://opencode.ai/inference/go/openai/v1";
export const OPENCODE_MODELS_URL = "https://opencode.ai/inference/go/v1/models";

export function createOpenCodeClient(apiKey: string) {
  const client = new OpenAI({
    baseURL: OPENCODE_API_BASE,
    apiKey,
    timeout: AI_REQUEST_TIMEOUT_MS,
    maxRetries: 1,
    defaultHeaders: { "User-Agent": "Colibly/1.0" },
  });

  async function complete(params: AICompletionParams): Promise<AICompletionResponse> {
    const res = await client.chat.completions.create(
      {
        model: params.model.replace(/^opencode-go\//, ""),
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })) as never,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 1024,
      },
      { headers: { "x-opencode-session": params.sessionId || randomUUID() } },
    );

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
