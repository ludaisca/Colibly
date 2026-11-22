import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../contrast";

// Contraste del tema de Astryx (themes/colibly → src/themes/colibly/colibly.css,
// generado por el editor de temas). Desde la migración a Astryx la UI la pinta
// este tema, no solo los tokens de globals.css (contrast.test.ts). Cada token
// se declara primero en la raíz como `light-dark(claro, oscuro)`; las
// repeticiones posteriores son ajustes por componente.
const css = readFileSync(path.resolve(__dirname, "../../../src/themes/colibly/colibly.css"), "utf8");

function rootTokens(): Record<string, { claro: string; oscuro: string }> {
  const out: Record<string, { claro: string; oscuro: string }> = {};
  for (const m of css.matchAll(/--color-([a-z-]+):\s*light-dark\(\s*(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})\s*\)/g)) {
    if (!(m[1] in out)) out[m[1]] = { claro: m[2], oscuro: m[3] };
  }
  return out;
}

const TOKENS = rootTokens();

// [texto, fondo, mínimo]: 4.5 = texto normal (WCAG AA).
const PAIRS: [string, string, number][] = [
  ["text-primary", "background-body", 4.5],
  ["text-primary", "background-surface", 4.5],
  ["text-primary", "background-card", 4.5],
  ["text-primary", "background-muted", 4.5],
  ["text-primary", "accent-muted", 4.5], // ítem activo del menú
  ["text-secondary", "background-body", 4.5],
  ["text-secondary", "background-surface", 4.5],
  ["text-secondary", "background-card", 4.5],
  ["text-accent", "background-body", 4.5],
  ["text-accent", "background-surface", 4.5],
  ["on-accent", "accent", 4.5], // botón primario
  ["on-error", "error", 4.5], // botón destructivo y toast de error
  ["on-success", "success", 4.5],
  ["on-warning", "warning", 4.5],
  ["on-info", "info", 4.5],
  ["text-error", "background-surface", 4.5],
  ["text-success", "background-surface", 4.5],
  ["text-warning", "background-surface", 4.5],
  ["text-info", "background-surface", 4.5],
];

describe("tema de Astryx: los tokens existen", () => {
  it.each([...new Set(PAIRS.flatMap(([fg, bg]) => [fg, bg]))])("--color-%s", (name) => {
    expect(TOKENS[name], `falta --color-${name} en colibly.css`).toBeDefined();
  });
});

describe.each(["claro", "oscuro"] as const)("contraste del tema de Astryx — %s", (mode) => {
  it.each(PAIRS)("--color-%s sobre --color-%s ≥ %s", (fg, bg, min) => {
    expect(contrastRatio(TOKENS[fg][mode], TOKENS[bg][mode])).toBeGreaterThanOrEqual(min);
  });
});
