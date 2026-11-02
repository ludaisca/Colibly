export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  // Data URI de una nota de voz. Gemini la manda como inlineData (google.ts
  // toParts); OpenCode la acepta tal cual en chat.completions con los modelos
  // MiMo (OPENCODE_AUDIO_MODEL). Solo la arma lib/ai/transcribe.ts: los bots
  // reciben la transcripción como texto, nunca el audio.
  | { type: "audio_url"; audio_url: { url: string } };

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface AICompletionParams {
  model: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  // Identificador estable de la conversación. OpenCode Go lo pide en
  // x-opencode-session para enrutar y reusar el caché del prompt.
  sessionId?: string;
  // Apaga el razonamiento en los modelos que lo traen encendido (OpenCode:
  // `thinking: {type: "disabled"}`). Con MiMo y audio, si razona, deja
  // `content` vacío y gasta los tokens en `reasoning_content`.
  disableThinking?: boolean;
}

export interface AICompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface AIEmbeddingParams {
  model: string;
  input: string | string[];
}

export interface AIEmbeddingResponse {
  embeddings: number[][];
}

export type AIProvider = "opencode" | "google";
