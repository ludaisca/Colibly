import { describe, expect, it } from "vitest";
import { buildFunnel, defaultGranularity, forecastBucket, previousPeriod, rate, resolvePeriod, winRate } from "../report-rules";

const d = (iso: string) => new Date(iso);
const TZ = "America/Mexico_City";

describe("resolvePeriod", () => {
  const now = d("2026-10-06T18:00:00Z"); // 12:00 en CDMX

  it("sin parámetros: últimos 90 días contando hoy, en la zona de la organización", () => {
    const p = resolvePeriod({}, TZ, now);
    expect(p.to.toISOString()).toBe("2026-10-07T06:00:00.000Z");
    expect(p.from.toISOString()).toBe("2026-07-09T06:00:00.000Z"); // 90 días: 9 jul … 6 oct
    expect(Math.round((p.to.getTime() - p.from.getTime()) / 86_400_000)).toBe(90);
  });

  it("las fechas YYYY-MM-DD son días locales y el final incluye ese día", () => {
    const p = resolvePeriod({ from: "2026-10-01", to: "2026-10-05" }, TZ, now);
    expect(p.from.toISOString()).toBe("2026-10-01T06:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-10-06T06:00:00.000Z");
  });

  it("acepta instantes ISO tal cual", () => {
    const p = resolvePeriod({ from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z" }, TZ, now);
    expect(p.to.toISOString()).toBe("2026-10-02T00:00:00.000Z");
  });

  it("rechaza fechas inválidas, periodos al revés y demasiado largos", () => {
    expect(() => resolvePeriod({ from: "ayer" }, TZ, now)).toThrow("Fecha inválida");
    expect(() => resolvePeriod({ from: "2026-02-31" }, TZ, now)).toThrow("Fecha inválida");
    expect(() => resolvePeriod({ from: "2026-10-05", to: "2026-10-01" }, TZ, now)).toThrow("empezar antes");
    expect(() => resolvePeriod({ from: "2020-01-01", to: "2026-10-01" }, TZ, now)).toThrow("800");
  });
});

describe("periodo anterior y granularidad", () => {
  it("el anterior termina donde empieza el actual y mide lo mismo", () => {
    const p = { from: d("2026-10-01T00:00:00Z"), to: d("2026-10-11T00:00:00Z") };
    const prev = previousPeriod(p);
    expect(prev.to).toEqual(p.from);
    expect(prev.to.getTime() - prev.from.getTime()).toBe(p.to.getTime() - p.from.getTime());
  });
  it("elige día, semana o mes según el largo", () => {
    const mk = (days: number) => ({ from: d("2026-01-01T00:00:00Z"), to: new Date(d("2026-01-01T00:00:00Z").getTime() + days * 86_400_000) });
    expect(defaultGranularity(mk(30))).toBe("day");
    expect(defaultGranularity(mk(90))).toBe("week");
    expect(defaultGranularity(mk(365))).toBe("month");
  });
});

describe("tasas", () => {
  it("sin base devuelve null, no 0 %", () => {
    expect(rate(0, 0)).toBeNull();
    expect(winRate(0, 0)).toBeNull();
  });
  it("redondea a un decimal", () => {
    expect(rate(1, 3)).toBe(33.3);
    expect(winRate(3, 1)).toBe(75);
    expect(winRate(0, 4)).toBe(0);
  });
});

describe("buildFunnel", () => {
  const stages = [
    { id: "n", name: "Nuevo", position: 0 },
    { id: "c", name: "Contactado", position: 1 },
    { id: "q", name: "Calificado", position: 2 },
  ];

  it("cuenta cuántos llegaron a cada etapa y a Ganado, con conversión", () => {
    // 10 negocios: 4 se quedaron en Nuevo, 2 llegaron a Contactado, 1 a Calificado, 3 se ganaron.
    const { total, rows } = buildFunnel(stages, [
      { maxOpenPosition: 0, everWon: false, count: 4 },
      { maxOpenPosition: 1, everWon: false, count: 2 },
      { maxOpenPosition: 2, everWon: false, count: 1 },
      { maxOpenPosition: 2, everWon: true, count: 3 },
    ]);
    expect(total).toBe(10);
    expect(rows.map((r) => [r.name, r.reached])).toEqual([["Nuevo", 10], ["Contactado", 6], ["Calificado", 4], ["Ganado", 3]]);
    expect(rows[1].fromPrevious).toBe(60);
    expect(rows[2].fromPrevious).toBe(66.7);
    expect(rows[3].fromPrevious).toBe(75);
    expect(rows[3].fromStart).toBe(30);
    expect(rows[0].fromPrevious).toBeNull();
  });

  it("un negocio que saltó etapas cuenta como haber pasado por las intermedias", () => {
    const { rows } = buildFunnel(stages, [{ maxOpenPosition: 2, everWon: false, count: 1 }]);
    expect(rows.map((r) => r.reached)).toEqual([1, 1, 1, 0]);
  });

  it("un ganado cuenta en todas las etapas aunque no haya historial abierto", () => {
    const { rows } = buildFunnel(stages, [{ maxOpenPosition: null, everWon: true, count: 2 }]);
    expect(rows.map((r) => r.reached)).toEqual([2, 2, 2, 2]);
  });

  it("sin negocios no hay división entre cero", () => {
    const { total, rows } = buildFunnel(stages, []);
    expect(total).toBe(0);
    expect(rows.every((r) => r.reached === 0 && r.fromPrevious === null && r.fromStart === null)).toBe(true);
  });
});

describe("forecastBucket", () => {
  const now = d("2026-10-06T18:00:00Z");
  it("agrupa por mes, vencidos y sin fecha", () => {
    expect(forecastBucket(null, now)).toBe("none");
    expect(forecastBucket(d("2026-10-05T12:00:00Z"), now)).toBe("overdue");
    expect(forecastBucket(d("2026-10-06T12:00:00Z"), now)).toBe("2026-10");
    expect(forecastBucket(d("2026-12-31T12:00:00Z"), now)).toBe("2026-12");
  });
});
