// Mapa de calor día × hora (benchmark #9). Puro: arma la cuadrícula a partir
// de las filas agregadas en SQL y calcula la intensidad para el color.

/** 7 filas (0 = domingo, igual que Date#getDay / EXTRACT(dow)) × 24 horas. */
export type HeatmapGrid = number[][];

export function emptyGrid(): HeatmapGrid {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

export function buildHeatmapGrid(rows: Array<{ dow: number; hour: number; count: number }>): HeatmapGrid {
  const grid = emptyGrid();
  for (const row of rows) {
    const dow = Math.trunc(Number(row.dow));
    const hour = Math.trunc(Number(row.hour));
    if (dow < 0 || dow > 6 || hour < 0 || hour > 23) continue;
    grid[dow][hour] += Number(row.count);
  }
  return grid;
}

export function gridMax(grid: HeatmapGrid): number {
  return grid.reduce((max, row) => Math.max(max, ...row), 0);
}

/**
 * Intensidad 0–1 con raíz cuadrada: con conteos muy desiguales (una hora pico
 * de 300 y el resto en 5) la escala lineal dejaba todo lo demás en blanco.
 */
export function heatIntensity(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return Math.min(1, Math.sqrt(count / max));
}
