import { describe, expect, it } from "vitest";
import { normalizeManualPhone, phoneLookupJids } from "../manual-phone";

describe("normalizeManualPhone", () => {
  it("las formas habituales de un mismo número dan el mismo resultado", () => {
    const forms = ["5512345678", "+52 55 1234 5678", "525512345678", "5215512345678", "(55) 1234-5678"];
    for (const f of forms) expect(normalizeManualPhone(f)).toBe("525512345678");
  });
  it("respeta números de otros países y rechaza lo que no es un teléfono", () => {
    expect(normalizeManualPhone("+1 415 555 2671")).toBe("14155552671");
    expect(normalizeManualPhone("")).toBeNull();
    expect(normalizeManualPhone("abc")).toBeNull();
    expect(normalizeManualPhone("123")).toBeNull();
    expect(normalizeManualPhone("1234567890123456")).toBeNull();
  });
});

describe("phoneLookupJids", () => {
  it("busca también la variante 521 de México", () => {
    expect(phoneLookupJids("525512345678").sort()).toEqual(["5215512345678", "525512345678"]);
  });
});

import { normalizeChannellessRows } from "../manual-phone";

describe("normalizeChannellessRows (import CSV sin canal)", () => {
  it("normaliza, descarta lo que no es teléfono y deja un contacto por número", () => {
    const rows = [
      { phone: "5512345678", name: "Ana" },
      { phone: "+52 55 1234 5678", name: "Ana otra vez" },
      { phone: "5215587654321", name: "Beto" },
      { phone: "123", name: "Basura" },
    ];
    expect(normalizeChannellessRows(rows)).toEqual([
      { phone: "525512345678", name: "Ana" },
      { phone: "525587654321", name: "Beto" },
    ]);
  });
});
