import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readThemeTokens } from "../contrast";

const css = readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
const THEMES = { claro: readThemeTokens(css), oscuro: readThemeTokens(css, ".dark") };

// [texto, fondo, mínimo]. 4.5 = texto normal (WCAG AA); 3 = iconos, bordes
// de controles y anillos de foco (WCAG 1.4.11).
const PAIRS: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["foreground", "surface-light", 4.5],
  ["muted", "background", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "surface-light", 4.5],
  ["muted-strong", "background", 4.5],
  ["muted-strong", "surface", 4.5],
  ["muted-strong", "surface-light", 4.5],
  ["muted-strong", "accent-subtle", 4.5],
  ["on-accent", "accent", 4.5],
  ["on-accent", "accent-hover", 4.5],
  ["foreground", "accent-muted", 4.5],
  ["foreground", "accent-subtle", 4.5],
  ["accent-ink", "surface", 4.5],
  ["accent-ink", "background", 4.5],
  ["accent-ink", "accent-subtle", 4.5],
  ["accent-strong", "surface", 3],
  ["ring", "background", 3],
  ["surface", "danger", 4.5],
  ["surface", "info", 4.5],
  ["surface", "warning", 4.5],
  ["surface", "accent-2", 4.5],
  ["accent-2", "surface", 4.5],
  ["accent-2", "accent-2-bg", 4.5],
  ["success", "surface", 4.5],
  ["success", "success-bg", 4.5],
  ["warning", "surface", 4.5],
  ["warning", "warning-bg", 4.5],
  ["danger", "surface", 4.5],
  ["danger", "danger-bg", 4.5],
  ["info", "surface", 4.5],
  ["info", "info-bg", 4.5],
];

describe.each(Object.entries(THEMES))("contraste de los tokens — tema %s", (_theme, tokens) => {
  it.each(PAIRS)("--%s sobre --%s ≥ %s", (fg, bg, min) => {
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe("contrastRatio", () => {
  it("calcula los extremos conocidos", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });
});
