import { describe, expect, it } from "vitest";
import { humanTakeoverUntil } from "../guards";

const now = new Date("2026-10-03T02:10:00.000Z");
const humanReply = new Date("2026-10-03T02:07:46.000Z");

describe("control humano del bot", () => {
  it("pausa 30 minutos después de una respuesta manual", () => {
    expect(humanTakeoverUntil(humanReply, null, now)?.toISOString()).toBe("2026-10-03T02:37:46.000Z");
  });

  it("termina la pausa cuando un agente devuelve el chat al bot", () => {
    expect(humanTakeoverUntil(humanReply, new Date("2026-10-03T02:09:00.000Z"), now)).toBeNull();
  });

  it("una nueva respuesta manual vuelve a pausar el bot", () => {
    const resumedAt = new Date("2026-10-03T02:06:00.000Z");
    expect(humanTakeoverUntil(humanReply, resumedAt, now)?.toISOString()).toBe("2026-10-03T02:37:46.000Z");
  });

  it("vence después de 30 minutos", () => {
    expect(humanTakeoverUntil(humanReply, null, new Date("2026-10-03T02:37:46.000Z"))).toBeNull();
  });
});
