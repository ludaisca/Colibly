import { randomUUID } from "crypto";
import OpenAI from "openai";
import { AI_REQUEST_TIMEOUT_MS } from "@/lib/http-timeouts";
import type { AICompletionParams, AICompletionResponse, AIEmbeddingParams, AIEmbeddingResponse } from "../types";

// OpenCode Go (opencode.ai/docs/go) — suscripción plana. El grupo cableado es
// chat.completions en el endpoint actual; /v1/responses y /v1/messages no.
// Go rechaza la llamada si falta x-opencode-session.
export const OPENCODE_API_BASE = "https://opencode.ai/inference/go/openai/v1";
export const OPENCODE_MODELS_URL = "https://opencode.ai/inference/go/v1/models";

// Formato de los ids que acepta /v1/chat/completions en Go.
export const OPENCODE_MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,80}$/;

// Modelo de OpenCode Go que entiende audio (chat.completions + audio_url con
// data URI; ogg, mp3, wav). Solo transcribe: los bots responden con el modelo
// de texto elegido en /plataforma, sobre la transcripción. Se llama con
// disableThinking: con razonamiento devuelve `content: null`.
export const OPENCODE_AUDIO_MODEL = "mimo-v2.6-flash";

export interface OpenCodeModelOption {
  id: string;
  label: string;
}

const CATALOG_TTL_MS = 5 * 60 * 1000;
let catalogCache: { apiKey: string; models: OpenCodeModelOption[]; expiresAt: number } | null = null;

// Catálogo en vivo de OpenCode Go. null = no se pudo consultar (sin red, key
// rechazada, respuesta vacía): el llamador decide si cae a los recomendados o
// si solo valida el formato del id. Se cachea 5 min para no consultarlo en cada
// guardado de /plataforma ni en cada carga del panel.
export async function fetchOpenCodeModelCatalog(apiKey: string): Promise<OpenCodeModelOption[] | null> {
  if (catalogCache && catalogCache.apiKey === apiKey && catalogCache.expiresAt > Date.now()) {
    return catalogCache.models;
  }
  try {
    const res = await fetch(OPENCODE_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": "Colibly/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const parsed = await res.json();
    const list = Array.isArray(parsed) ? parsed : parsed.data ?? [];
    const models = list
      .map((m: { id?: unknown }) => (typeof m?.id === "string" ? m.id : ""))
      .filter((id: string) => OPENCODE_MODEL_ID.test(id))
      .sort()
      .map((id: string) => ({ id, label: id }));
    if (models.length === 0) return null;
    catalogCache = { apiKey, models, expiresAt: Date.now() + CATALOG_TTL_MS };
    return models;
  } catch {
    return null;
  }
}

export function createOpenCodeClient(apiKey: string) {
  const client = new OpenAI({
    baseURL: OPENCODE_API_BASE,
    apiKey,
    timeout: AI_REQUEST_TIMEOUT_MS,
    maxRetries: 1,
    defaultHeaders: { "User-Agent": "Colibly/1.0" },
  });

  async function complete(params: AICompletionParams): Promise<AICompletionResponse> {
    // `thinking` no está en los tipos del SDK; OpenCode lo pasa al modelo.
    const body: OpenAI.ChatCompletionCreateParamsNonStreaming & { thinking?: { type: "disabled" } } = {
      model: params.model.replace(/^opencode-go\//, ""),
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as never,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 1024,
      ...(params.disableThinking ? { thinking: { type: "disabled" as const } } : {}),
    };
    const res = await client.chat.completions.create(body, {
      headers: { "x-opencode-session": params.sessionId || randomUUID() },
    });

    // Nunca se lee `reasoning_content`: es el razonamiento del modelo, no la
    // respuesta, y no debe llegar a un cliente ni a una transcripción.
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
