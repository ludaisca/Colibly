import { describe, expect, it } from "vitest";
import { appendSignature } from "../signature";

describe("appendSignature", () => {
  it("agrega la firma en un renglón aparte", () => {
    expect(appendSignature("Hola, ¿cómo estás?", "— Luis, Ventas", true, 4096)).toBe("Hola, ¿cómo estás?\n\n— Luis, Ventas");
  });
  it("apagada o vacía: sin cambios", () => {
    expect(appendSignature("Hola", "— Luis", false, 4096)).toBe("Hola");
    expect(appendSignature("Hola", "   ", true, 4096)).toBe("Hola");
    expect(appendSignature("Hola", null, true, 4096)).toBe("Hola");
  });
  it("no la duplica si el agente ya la escribió", () => {
    expect(appendSignature("Gracias\n\n— Luis  ", "— Luis", true, 4096)).toBe("Gracias\n\n— Luis  ");
  });
  it("si se pasaría del límite del canal, manda el texto sin firma", () => {
    const long = "x".repeat(4090);
    expect(appendSignature(long, "— Luis", true, 4096)).toBe(long);
  });
});
