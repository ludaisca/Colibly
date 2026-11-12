import { describe, expect, it } from "vitest";
import { chartDayKeys, dateKeyInTz, mergeAgentRows, StatsTimeoutError, withTimeout } from "../aggregate-rules";

const MX = "America/Mexico_City";

describe("fechas del gráfico", () => {
  it("en la tarde de México el último día es hoy en México, no mañana en UTC", () => {
    // 10 nov 2026 a las 20:00 en CDMX = 11 nov 02:00 UTC.
    const now = new Date("2026-11-11T02:00:00Z");
    expect(dateKeyInTz(now, MX)).toBe("2026-11-10");
    const keys = chartDayKeys(now, MX);
    expect(keys).toHaveLength(14);
    expect(keys.at(-1)).toBe("2026-11-10");
    expect(keys[0]).toBe("2026-10-28");
  });
  it("cruza meses sin saltarse días", () => {
    const keys = chartDayKeys(new Date("2026-03-02T18:00:00Z"), MX, 4);
    expect(keys).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
});

describe("mergeAgentRows", () => {
  it("suma WhatsApp y canales por agente y agrega su primera respuesta (mediana y promedio)", () => {
    const out = mergeAgentRows(
      [
        { userId: "a", resolved: 2, resolutionSum: 100, resolutionCount: 2 },
        { userId: "a", resolved: 1, resolutionSum: 0, resolutionCount: 0 },
        { userId: "b", resolved: 5, resolutionSum: 50, resolutionCount: 5 },
      ],
      new Map([["a", [2, 4, 300]], ["c", [1]]])
    );
    expect(out[0]).toEqual({ userId: "b", resolvedCount: 5, medianFirstResponseMinutes: null, avgFirstResponseMinutes: null, respondedCount: 0, avgResolutionMinutes: 10 });
    expect(out[1]).toEqual({ userId: "a", resolvedCount: 3, medianFirstResponseMinutes: 4, avgFirstResponseMinutes: 102, respondedCount: 3, avgResolutionMinutes: 50 });
    // Respondió sin chats asignados: también aparece.
    expect(out[2]).toMatchObject({ userId: "c", resolvedCount: 0, medianFirstResponseMinutes: 1 });
  });
});

describe("withTimeout", () => {
  it("devuelve el resultado si llega a tiempo", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });
  it("corta con StatsTimeoutError si tarda demasiado", async () => {
    await expect(withTimeout(new Promise((r) => setTimeout(r, 200)), 10)).rejects.toBeInstanceOf(StatsTimeoutError);
  });
});
