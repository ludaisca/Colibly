import { describe, expect, it } from "vitest";
import { classifyBotChat, summarizeBotPerformance } from "../bot-performance-rules";

describe("classifyBotChat", () => {
  it("una persona que escribe después del bot es traspaso, aunque esté resuelto", () => {
    expect(classifyBotChat({ resolved: true, humanAfterBot: true })).toBe("handed_off");
    expect(classifyBotChat({ resolved: false, humanAfterBot: true })).toBe("handed_off");
  });
  it("resuelto sin persona = resuelto por el bot; si no, abierto", () => {
    expect(classifyBotChat({ resolved: true, humanAfterBot: false })).toBe("resolved_by_bot");
    expect(classifyBotChat({ resolved: false, humanAfterBot: false })).toBe("open");
  });
});

describe("summarizeBotPerformance", () => {
  it("totales, porcentajes y CSAT separado por grupo", () => {
    const summary = summarizeBotPerformance([
      { botReplies: 3, resolved: true, humanAfterBot: false, csat: 5 },
      { botReplies: 2, resolved: true, humanAfterBot: false, csat: 4 },
      { botReplies: 1, resolved: true, humanAfterBot: true, csat: 2 },
      { botReplies: 4, resolved: false, humanAfterBot: false, csat: null },
    ]);
    expect(summary).toMatchObject({
      chats: 4,
      botReplies: 10,
      resolvedByBot: 2,
      handedOff: 1,
      open: 1,
      resolvedByBotPct: 50,
      handedOffPct: 25,
      csatBotOnly: { avg: 4.5, responses: 2 },
      csatHandedOff: { avg: 2, responses: 1 },
    });
  });
  it("sin chats: porcentajes nulos", () => {
    expect(summarizeBotPerformance([])).toMatchObject({ chats: 0, resolvedByBotPct: null, handedOffPct: null });
  });
});
