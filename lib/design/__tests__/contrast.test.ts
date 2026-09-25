import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readRootTokens } from "../contrast";

const tokens = readRootTokens(readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8"));

// [texto, fondo, mínimo]. 4.5 = texto normal (WCAG AA); 3 = iconos, bordes
// de controles y anillos de foco (WCAG 1.4.11).
const PAIRS: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["foreground", "surface-light", 4.5],
  ["muted", "background", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "surface-light", 4.5],
  ["on-accent", "accent", 4.5],
  ["on-accent", "accent-hover", 4.5],
  ["on-accent", "accent-muted", 4.5],
  ["accent-ink", "surface", 4.5],
  ["accent-ink", "background", 4.5],
  ["accent-ink", "accent-subtle", 4.5],
  ["accent-strong", "surface", 3],
  ["ring", "background", 3],
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

describe("contraste de los tokens de color", () => {
  it.each(PAIRS)("--%s sobre --%s ≥ %s", (fg, bg, min) => {
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });

  it("calcula los extremos conocidos", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });
});
