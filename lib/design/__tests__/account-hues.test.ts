import { describe, expect, it } from "vitest";
import { assignAccountHues, hueIndex } from "@/app/components/ui/hue";

describe("assignAccountHues", () => {
  it("dos cuentas que el hash pone en el mismo tono quedan distintas", () => {
    // Ids reales de la revisión: ambos caen en el índice 2.
    const a = "cmvr4exmb0001rz94s6xs3ns2";
    const b = "cmvr56mwx000d12hyhfuyu5sv";
    expect(hueIndex(a)).toBe(hueIndex(b));
    const hues = assignAccountHues([{ id: a, createdAt: "2026-10-27" }, { id: b, createdAt: "2026-10-28" }]);
    expect(hues[a]).toBe(hueIndex(a)); // la más antigua conserva su tono
    expect(hues[b]).not.toBe(hues[a]);
  });
  it("hasta 8 cuentas, ningún tono repetido; agregar una no cambia las anteriores", () => {
    const accounts = Array.from({ length: 8 }, (_, i) => ({ id: `acc-${i}`, createdAt: new Date(2026, 0, i + 1) }));
    const hues = assignAccountHues(accounts);
    expect(new Set(Object.values(hues)).size).toBe(8);
    const fewer = assignAccountHues(accounts.slice(0, 5));
    for (const { id } of accounts.slice(0, 5)) expect(fewer[id]).toBe(hues[id]);
  });
});
