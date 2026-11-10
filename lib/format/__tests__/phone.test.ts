import { describe, expect, it } from "vitest";
import { formatPhoneShort } from "../phone";

describe("formatPhoneShort", () => {
  it("da formato corto a los números de México, con o sin el 1 de móvil", () => {
    expect(formatPhoneShort("525568623317")).toBe("+52 55 6862 3317");
    expect(formatPhoneShort("5215568623317")).toBe("+52 55 6862 3317");
    expect(formatPhoneShort("525568623317@s.whatsapp.net")).toBe("+52 55 6862 3317");
  });
  it("otros países y ids que no son teléfonos", () => {
    expect(formatPhoneShort("14155552671")).toBe("+14155552671");
    expect(formatPhoneShort("MX.1399244639027519")).toBeNull();
    expect(formatPhoneShort(null)).toBeNull();
  });
});
