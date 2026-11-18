import { describe, expect, it } from "vitest";
import { redact } from "../audit";

describe("redact (auditoría de plataforma)", () => {
  it("conserva las fechas como ISO en vez de {}", () => {
    const d = new Date("2026-11-20T10:00:00.000Z");
    expect(redact({ trialEndsAt: d, nested: { at: d } })).toEqual({ trialEndsAt: d.toISOString(), nested: { at: d.toISOString() } });
  });

  it("una fecha inválida queda en null", () => {
    expect(redact({ at: new Date("x") })).toEqual({ at: null });
  });

  it("sigue ocultando los secretos", () => {
    expect(redact({ apiKey: "sk-123", password: "", name: "ok" })).toEqual({ apiKey: "[set]", password: "[empty]", name: "ok" });
  });
});
