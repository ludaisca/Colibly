import { describe, expect, it } from "vitest";
import { tagDeleteWarning } from "@/lib/tags-shared";

describe("tagDeleteWarning", () => {
  it("sin usos no agrega nada", () => {
    expect(tagDeleteWarning({ sequences: [], automations: [] })).toBeNull();
    expect(tagDeleteWarning(null)).toBeNull();
  });
  it("una secuencia", () => {
    expect(tagDeleteWarning({ sequences: [{ id: "s", name: "Bienvenida" }], automations: [] })).toBe("La secuencia «Bienvenida» la usa como disparador; dejará de dispararse.");
  });
  it("una automatización", () => {
    expect(tagDeleteWarning({ sequences: [], automations: [{ id: "a", name: "VIP" }] })).toBe("La automatización «VIP» la usa como disparador; dejará de dispararse.");
  });
  it("varias, en plural", () => {
    expect(tagDeleteWarning({ sequences: [{ id: "s", name: "A" }, { id: "t", name: "B" }], automations: [{ id: "a", name: "C" }] })).toBe(
      "Las secuencias «A», «B» y la automatización «C» la usan como disparador; dejarán de dispararse."
    );
  });
});
