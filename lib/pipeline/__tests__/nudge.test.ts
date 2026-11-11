import { describe, expect, it } from "vitest";
import { shouldNudgeFunnel, shouldNudgeTags } from "../nudge";

describe("shouldNudgeFunnel", () => {
  it("todo en «Nuevo» con volumen: sugerir moverlos", () => {
    expect(shouldNudgeFunnel({ openCount: 1350, firstStageCount: 1350, openValueCents: 0 })).toBe(true);
  });
  it("valor abierto en $0 aunque estén repartidos", () => {
    expect(shouldNudgeFunnel({ openCount: 40, firstStageCount: 10, openValueCents: 0 })).toBe(true);
  });
  it("embudo trabajado o con pocos leads: nada", () => {
    expect(shouldNudgeFunnel({ openCount: 40, firstStageCount: 10, openValueCents: 500000 })).toBe(false);
    expect(shouldNudgeFunnel({ openCount: 5, firstStageCount: 5, openValueCents: 0 })).toBe(false);
  });
});

describe("shouldNudgeTags", () => {
  it("contactos sin ninguna etiqueta real", () => {
    expect(shouldNudgeTags({ realContacts: 1354, realTags: 0 })).toBe(true);
    expect(shouldNudgeTags({ realContacts: 1354, realTags: 2 })).toBe(false);
    expect(shouldNudgeTags({ realContacts: 3, realTags: 0 })).toBe(false);
  });
});
