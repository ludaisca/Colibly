import { markdownToWhatsApp } from "@/lib/whatsapp/markdown-to-whatsapp";
import { getAIProvider } from "@/lib/ai/factory";
import { wrapUserPrompt, SCOPE_GUARDRAIL } from "@/lib/ai/prompt-sanitizer";
import type { AIProvider, AIMessage } from "@/lib/ai/types";

// Framed as a "user" turn (not "system") on purpose: the history above ends
// on an "assistant" turn (our own last real message), and a chat-tuned model
// expects to keep alternating — closing on another system aside with no
// fresh user turn left the model without a clear "your turn to speak now"
// signal, and it drifted into writing the NEXT customer line instead of its
// own reply (confirmed live: it literally wrote in the lead's voice). This is
// explicitly labeled as an internal instruction, not something the customer
// said, so the model doesn't mistake it for real customer input either.
export const ATTEMPT_INSTRUCTION: Record<1 | 2, string> = {
  1: "(Instrucción interna del sistema, no es un mensaje del cliente) El cliente dejó de responder hace un rato. Escribe TÚ, como el agente, un mensaje breve, natural y cordial para retomar la conversación justo donde se quedó — refiérete a algo concreto de lo que ya se habló, sin sonar a plantilla de marketing ni repetir literalmente tu último mensaje. Responde solo con el texto del mensaje a enviar, nada más.",
  2: "(Instrucción interna del sistema, no es un mensaje del cliente) El cliente sigue sin responder después de un primer mensaje de seguimiento. Escribe TÚ, como el agente, un segundo mensaje breve, un poco más directo pero siempre cordial — dale una razón concreta o una pregunta fácil de contestar para retomar el contacto. No repitas el mensaje anterior ni suenes insistente. Responde solo con el texto del mensaje a enviar, nada más.",
};

export interface RecoveryHistoryMessage {
  direction: "INBOUND" | "OUTBOUND";
  text: string | null;
}

// Parte pura (sin efectos secundarios: sin envío, sin persistencia) del
// generador de mensajes de reactivación, compartida por WhatsApp
// (lib/whatsapp/lead-recovery.ts) y los canales genéricos (lib/channels/lead-recovery.ts)
// para no duplicar el prompt/guardrail/loop de mensajes en dos archivos.
export async function generateRecoveryReply(params: {
  systemPrompt: string;
  provider: AIProvider;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  // Ya en orden cronológico (más viejo primero) y ya acotado por el caller
  // (mismo HISTORY_LIMIT que usaba el query original de WhatsApp).
  history: RecoveryHistoryMessage[];
  attemptNumber: 1 | 2;
}): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
  const messages: AIMessage[] = [
    { role: "system", content: wrapUserPrompt(params.systemPrompt) },
    { role: "system", content: SCOPE_GUARDRAIL },
  ];

  for (const msg of params.history) {
    if (!msg.text) continue;
    messages.push({ role: msg.direction === "INBOUND" ? "user" : "assistant", content: msg.text });
  }

  messages.push({ role: "user", content: ATTEMPT_INSTRUCTION[params.attemptNumber] });

  const client = getAIProvider(params.provider, params.apiKey);
  const result = await client.complete({
    model: params.model,
    messages,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });

  // Va directo al cliente: Markdown del modelo → formato de WhatsApp.
  return { content: markdownToWhatsApp(result.content), usage: result.usage };
}
