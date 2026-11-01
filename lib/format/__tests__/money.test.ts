import { describe, expect, it } from "vitest";
import { DEAL_VALUE_MAX_PESOS, centsToPesos, formatMxn, pesosToCents } from "@/lib/money";

describe("money", () => {
  it("convierte sin errores de coma flotante", () => {
    expect(pesosToCents(19.99)).toBe(1999);
    expect(pesosToCents(0.1 + 0.2)).toBe(30);
    expect(pesosToCents(12500)).toBe(1_250_000);
    expect(centsToPesos(1999)).toBe(19.99);
  });

  it("el tope cabe en un Int de Postgres", () => {
    expect(pesosToCents(DEAL_VALUE_MAX_PESOS)).toBeLessThanOrEqual(2_147_483_647);
  });

  it("formatea en pesos mexicanos", () => {
    expect(formatMxn(1_250_000)).toBe("$12,500");
    expect(formatMxn(1999)).toBe("$19.99");
    expect(formatMxn(1999, { whole: true })).toBe("$20");
    expect(formatMxn(0)).toBe("$0");
  });

  it("compacto solo para montos grandes", () => {
    expect(formatMxn(1_250_000, { compact: true })).toBe("$12,500");
    expect(formatMxn(150_000_000, { compact: true })).toMatch(/^\$1\.5\s?M/);
  });
});
