import { describe, expect, it } from "vitest";
import { buildHeatmapGrid, gridMax, heatIntensity } from "../heatmap-rules";

describe("heatmap", () => {
  it("arma la cuadrícula 7×24 y suma filas repetidas (WhatsApp + canales)", () => {
    const grid = buildHeatmapGrid([
      { dow: 1, hour: 10, count: 3 },
      { dow: 1, hour: 10, count: 2 },
      { dow: 0, hour: 23, count: 1 },
    ]);
    expect(grid).toHaveLength(7);
    expect(grid.every((row) => row.length === 24)).toBe(true);
    expect(grid[1][10]).toBe(5);
    expect(grid[0][23]).toBe(1);
    expect(gridMax(grid)).toBe(5);
  });

  it("ignora filas fuera de rango", () => {
    const grid = buildHeatmapGrid([{ dow: 7, hour: 1, count: 9 }, { dow: 2, hour: 24, count: 9 }]);
    expect(gridMax(grid)).toBe(0);
  });

  it("intensidad con raíz cuadrada y límites", () => {
    expect(heatIntensity(0, 100)).toBe(0);
    expect(heatIntensity(100, 100)).toBe(1);
    expect(heatIntensity(25, 100)).toBe(0.5);
    expect(heatIntensity(5, 0)).toBe(0);
  });
});
