import { describe, expect, it } from "vitest";
import { buildTestMessages, type TestTurn } from "../test-conversation";

const history: TestTurn[] = [
  { role: "user", content: "Me llamo Ana" },
  { role: "assistant", content: "Hola, Ana" },
  { role: "user", content: "Busco el plan Pro" },
  { role: "assistant", content: "Te cuento el plan Pro" },
];
const bot = { systemPrompt: "Responde sobre ventas", memoryType: "RECENT", memoryLimit: 1 };

describe("conversación de prueba del bot", () => {
  it("RECENT incluye solo los turnos permitidos y termina con la pregunta actual", () => {
    const messages = buildTestMessages(bot, "¿Cuánto cuesta?", history, null);
    expect(messages.slice(-3)).toEqual([...history.slice(-2), { role: "user", content: "¿Cuánto cuesta?" }]);
  });

  it("NONE no arrastra la conversación anterior", () => {
    const messages = buildTestMessages({ ...bot, memoryType: "NONE" }, "¿Cuánto cuesta?", history, null);
    expect(messages).toHaveLength(3);
    expect(messages.at(-1)).toEqual({ role: "user", content: "¿Cuánto cuesta?" });
  });

  it("SUMMARY usa un resumen de ambos lados y no repite turnos separados", () => {
    const messages = buildTestMessages({ ...bot, memoryType: "SUMMARY" }, "¿Cuánto cuesta?", history, null);
    expect(messages).toHaveLength(4);
    expect(messages[2]).toMatchObject({ role: "system" });
    expect(messages[2].content).toContain("Cliente: Me llamo Ana");
    expect(messages[2].content).toContain("Asistente: Hola, Ana");
  });

  it("añade conocimiento relevante antes de la memoria y la pregunta", () => {
    const messages = buildTestMessages(bot, "¿Cuánto cuesta?", history, "Plan Pro: 10 USD");
    expect(messages[2]).toEqual({ role: "system", content: "Información relevante de la base de conocimiento:\n\nPlan Pro: 10 USD" });
    expect(messages.at(-1)).toEqual({ role: "user", content: "¿Cuánto cuesta?" });
  });
});
