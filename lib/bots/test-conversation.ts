import { wrapUserPrompt, SCOPE_GUARDRAIL } from "@/lib/ai/prompt-sanitizer";
import type { AIMessage } from "@/lib/ai/types";

export type TestTurn = { role: "user" | "assistant"; content: string };

export function buildTestMessages(
  bot: { systemPrompt: string; memoryType: string; memoryLimit: number },
  message: string,
  history: TestTurn[],
  knowledge: string | null
): AIMessage[] {
  const messages: AIMessage[] = [
    { role: "system", content: wrapUserPrompt(bot.systemPrompt) },
    { role: "system", content: SCOPE_GUARDRAIL },
  ];

  if (knowledge) messages.push({ role: "system", content: `Información relevante de la base de conocimiento:\n\n${knowledge}` });
  if (bot.memoryType === "RECENT" && bot.memoryLimit > 0) {
    messages.push(...history.slice(-Math.min(bot.memoryLimit * 2, 100)));
  }
  if (bot.memoryType === "SUMMARY" && history.length > 0) {
    const summary = history.map((turn) => `${turn.role === "user" ? "Cliente" : "Asistente"}: ${turn.content}`).join("\n\n---\n\n").slice(-2000);
    messages.push({ role: "system", content: `Resumen de la conversación anterior:\n${summary}` });
  }
  messages.push({ role: "user", content: message });
  return messages;
}
