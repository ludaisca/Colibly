import { describe, expect, it } from "vitest";
import { nudgeDismissKey, shouldNudgeUntagged, staleCutoff, STALE_FIRST_STAGE_HOURS } from "../nudge";

describe("staleCutoff", () => {
  it("resta las horas de la regla (24 h por defecto)", () => {
    const now = new Date("2026-11-11T18:00:00Z");
    expect(STALE_FIRST_STAGE_HOURS).toBe(24);
    expect(staleCutoff(now).toISOString()).toBe("2026-11-10T18:00:00.000Z");
    expect(staleCutoff(now, 2).toISOString()).toBe("2026-11-11T16:00:00.000Z");
  });
});

describe("shouldNudgeUntagged", () => {
  it("más de la mitad sin etiquetas, también en cuentas grandes con algunas etiquetas", () => {
    expect(shouldNudgeUntagged({ total: 1354, withoutTags: 1200 })).toBe(true);
    expect(shouldNudgeUntagged({ total: 10, withoutTags: 6 })).toBe(true);
  });
  it("la mitad exacta o menos: nada", () => {
    expect(shouldNudgeUntagged({ total: 10, withoutTags: 5 })).toBe(false);
    expect(shouldNudgeUntagged({ total: 1354, withoutTags: 100 })).toBe(false);
  });
  it("con muy pocos contactos todavía no se insiste", () => {
    expect(shouldNudgeUntagged({ total: 3, withoutTags: 3 })).toBe(false);
    expect(shouldNudgeUntagged({ total: 0, withoutTags: 0 })).toBe(false);
  });
});

describe("nudgeDismissKey", () => {
  it("cambia por aviso, persona y día", () => {
    const a = new Date(2026, 10, 11, 9);
    const b = new Date(2026, 10, 12, 9);
    expect(nudgeDismissKey("embudo", "u1", a)).toBe("colibly:nudge:embudo:u1:2026-11-11");
    expect(nudgeDismissKey("embudo", "u1", b)).not.toBe(nudgeDismissKey("embudo", "u1", a));
    expect(nudgeDismissKey("embudo", "u2", a)).not.toBe(nudgeDismissKey("embudo", "u1", a));
    expect(nudgeDismissKey("contactos", "u1", a)).not.toBe(nudgeDismissKey("embudo", "u1", a));
  });
});
