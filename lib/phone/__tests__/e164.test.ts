import { describe, expect, it } from "vitest";
import { toE164 } from "../e164";

describe("toE164", () => {
  it("quita el 1 móvil antiguo de México", () => {
    expect(toE164("5215512345678")).toBe("+525512345678");
    expect(toE164("+52 1 55 1234 5678")).toBe("+525512345678");
  });
  it("deja México sin 1 y otros países con +", () => {
    expect(toE164("525512345678")).toBe("+525512345678");
    expect(toE164("14155550123")).toBe("+14155550123");
    expect(toE164("+34 612 34 56 78")).toBe("+34612345678");
  });
  it("devuelve null para lo que no es teléfono", () => {
    expect(toE164(null)).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164("MX.1000000000000000")).toBeNull();
    expect(toE164("120363000000000000@g.us")).toBeNull();
    expect(toE164("1234")).toBeNull();
    expect(toE164("1234567890123456")).toBeNull();
  });
});
