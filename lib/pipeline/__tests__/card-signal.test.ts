import { describe, expect, it } from "vitest";
import { stallDays, stallSignal } from "../card-signal";

const now = Date.parse("2026-11-14T18:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000 - 60_000).toISOString();

describe("stallSignal", () => {
  it("menos de 3 días: sin señal de detenido", () => {
    expect(stallSignal({ stageEnteredAt: daysAgo(2), expectedCloseAt: null }, now)).toBeNull();
  });
  it("desde 3 días en ámbar y desde 6 en rojo", () => {
    expect(stallSignal({ stageEnteredAt: daysAgo(3), expectedCloseAt: null }, now)).toEqual({ tone: "warning", label: "Sin movimiento 3 d" });
    expect(stallSignal({ stageEnteredAt: daysAgo(6), expectedCloseAt: null }, now)).toEqual({ tone: "danger", label: "Sin movimiento 6 d" });
  });
  it("una etapa cerrada (ganada o perdida) no se marca como detenida", () => {
    expect(stallSignal({ closed: true, stageEnteredAt: daysAgo(10), expectedCloseAt: null }, now)).toBeNull();
  });
  it("sin estar detenida, muestra el siguiente paso en gris", () => {
    expect(stallSignal({ stageEnteredAt: daysAgo(1), expectedCloseAt: "2026-11-20T00:00:00.000Z" }, now)?.tone).toBe("neutral");
  });
  it("antes de hidratar (now null) no calcula tiempos", () => {
    expect(stallSignal({ stageEnteredAt: daysAgo(9), expectedCloseAt: null }, null)).toBeNull();
    expect(stallDays(null, now)).toBeNull();
  });
});
