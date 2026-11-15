import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readThemeTokens } from "../contrast";
import { BRAND_COLORS as B } from "../../brand-colors";

const css = readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
// Un tema claro y uno oscuro (dirección congelada, nov 2026).
const THEMES = {
  claro: readThemeTokens(css),
  oscuro: readThemeTokens(css, ".dark"),
};

// [texto, fondo, mínimo]. 4.5 = texto normal (WCAG AA); 3 = iconos, bordes
// de controles y anillos de foco (WCAG 1.4.11).
const PAIRS: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["foreground", "surface-light", 4.5],
  ["muted", "background", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "surface-light", 4.5],
  ["muted", "accent-subtle", 4.5],
  ["muted", "nav-active", 4.5],
  ["foreground", "nav-active", 4.5],
  ["border-strong", "surface", 3],
  ["on-accent", "accent", 4.5],
  ["on-accent", "accent-hover", 4.5],
  ["foreground", "accent-muted", 4.5],
  ["foreground", "accent-subtle", 4.5],
  ["foreground", "bubble-in", 4.5],
  ["foreground", "bubble-out", 4.5],
  ["accent-ink", "surface", 4.5],
  ["accent-ink", "surface-light", 4.5],
  ["accent-ink", "background", 4.5],
  ["accent-ink", "accent-subtle", 4.5],
  ["accent-strong", "surface", 3],
  ["ring", "background", 3],
  ["surface", "danger", 4.5],
  ["surface", "info", 4.5],
  ["surface", "warning", 4.5],
  ["success", "surface", 4.5],
  ["success", "success-bg", 4.5],
  ["warning", "surface", 4.5],
  ["warning", "warning-bg", 4.5],
  ["danger", "surface", 4.5],
  ["danger", "danger-bg", 4.5],
  ["info", "surface", 4.5],
  ["info", "info-bg", 4.5],
  ["code-fg", "code-bg", 4.5],
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

// Pares fijos en hex (correos, imágenes, widget de chat): no leen los tokens
// CSS, así que se verifican aparte.
const HEX_PAIRS: [string, string, string, number][] = [
  ["tinta sobre fondo", B.ink, B.background, 4.5],
  ["tinta sobre blanco (correo)", B.ink, B.surface, 4.5],
  ["secundario sobre fondo", B.muted, B.background, 4.5],
  ["secundario sobre blanco (correo)", B.muted, B.surface, 4.5],
  ["blanco sobre acento (botón)", B.onAccent, B.accent, 4.5],
  ["blanco sobre acento hover", B.onAccent, B.accentHover, 4.5],
  ["texto de marca sobre blanco", B.accentInk, B.surface, 4.5],
  ["texto de marca sobre fondo", B.accentInk, B.background, 4.5],
  ["texto de marca sobre tinte", B.accentInk, B.accentSubtle, 4.5],
  ["secundario sobre --surface-light", B.muted, B.surfaceLight, 4.5],
  ["borde de inputs sobre blanco", B.borderStrong, B.surface, 3],
];
describe("pares fijos de lib/brand-colors.ts", () => {
  it.each(HEX_PAIRS)("%s ≥ %s", (_n, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
  // Criterios de la dirección congelada (nov 2026).
  it("texto de marca ≥ 7:1 sobre blanco", () => {
    expect(contrastRatio(B.accentInk, B.surface)).toBeGreaterThanOrEqual(7);
  });
  it("brand-colors coincide con los primitivos de globals.css", () => {
    const t = readThemeTokens(css);
    expect(t["accent"].toLowerCase()).toBe(B.accent.toLowerCase());
    expect(t["accent-ink"].toLowerCase()).toBe(B.accentInk.toLowerCase());
    expect(t["muted"].toLowerCase()).toBe(B.muted.toLowerCase());
    expect(t["subtle"].toLowerCase()).toBe(B.subtle.toLowerCase());
    expect(t["border-strong"].toLowerCase()).toBe(B.borderStrong.toLowerCase());
    expect(t["surface-light"].toLowerCase()).toBe(B.surfaceLight.toLowerCase());
    expect(t["foreground"].toLowerCase()).toBe(B.ink.toLowerCase());
    expect(t["background"].toLowerCase()).toBe(B.background.toLowerCase());
  });
});
