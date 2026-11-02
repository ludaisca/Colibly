import { describe, expect, it } from "vitest";
import { awayCooldownFloor, awaySkipReason, type AwayDecisionInput } from "../away-message-rules";

const NOW = new Date("2026-11-02T03:00:00Z");
const base: AwayDecisionInput = {
  enabled: true,
  text: "Estamos fuera de horario, te contestamos mañana a las 9.",
  inBusinessHours: false,
  lastSentAt: null,
  now: NOW,
  isGroup: false,
  isFromComment: false,
  handledByBotOrFlow: false,
};

describe("awaySkipReason", () => {
  it("fuera de horario y sin aviso previo → se manda", () => {
    expect(awaySkipReason(base)).toBeNull();
  });

  it.each<[Partial<AwayDecisionInput>, string]>([
    [{ enabled: false }, "disabled"],
    [{ text: "   " }, "no_text"],
    [{ text: null }, "no_text"],
    [{ isGroup: true }, "group"],
    [{ isFromComment: true }, "comment"],
    [{ handledByBotOrFlow: true }, "bot_or_flow"],
    [{ inBusinessHours: true }, "in_hours"],
    [{ lastSentAt: new Date("2026-11-01T20:00:00Z") }, "cooldown"], // hace 7 h
  ])("%j → %s", (patch, reason) => {
    expect(awaySkipReason({ ...base, ...patch })).toBe(reason);
  });

  it("pasadas 12 h vuelve a mandarse", () => {
    expect(awaySkipReason({ ...base, lastSentAt: new Date("2026-11-01T14:59:00Z") })).toBeNull();
  });

  it("el bot gana aunque sea fuera de horario", () => {
    expect(awaySkipReason({ ...base, handledByBotOrFlow: true })).toBe("bot_or_flow");
  });
});

describe("awayCooldownFloor", () => {
  it("12 h antes", () => {
    expect(awayCooldownFloor(NOW).toISOString()).toBe("2026-11-01T15:00:00.000Z");
  });
});
