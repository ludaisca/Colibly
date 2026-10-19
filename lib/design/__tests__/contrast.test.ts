import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readThemeTokens } from "../contrast";
import { BRAND_COLORS as B } from "../../brand-colors";

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

// Pares fijos en hex (correos, imágenes, widget de chat, copia estática de
// cpanel-site): no leen los tokens CSS, así que se verifican aparte.
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
  ["grafito sobre blanco", B.graphite, B.surface, 4.5],
  ["tinta sobre menta (decorativo)", B.ink, B.mint, 4.5],
];
describe("pares fijos de lib/brand-colors.ts", () => {
  it.each(HEX_PAIRS)("%s ≥ %s", (_n, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
  it("la menta es solo decorativa: no sirve como texto sobre fondo claro", () => {
    expect(contrastRatio(B.mint, B.surface)).toBeLessThan(3);
  });
  it("brand-colors coincide con los primitivos de globals.css", () => {
    const t = readThemeTokens(css);
    expect(t["accent"].toLowerCase()).toBe(B.accent.toLowerCase());
    expect(t["foreground"].toLowerCase()).toBe(B.ink.toLowerCase());
    expect(t["background"].toLowerCase()).toBe(B.background.toLowerCase());
  });
});

// cpanel-site/assets/site.css usa variables propias: se leen del :root.
const siteCss = readFileSync(path.resolve(__dirname, "../../../cpanel-site/assets/site.css"), "utf8");
const siteVars = Object.fromEntries([...siteCss.matchAll(/--([a-z-]+):(#[0-9a-fA-F]{3,6})\b/g)].map((m) => [m[1], m[2].length === 4 ? `#${[...m[2].slice(1)].map((c) => c + c).join("")}` : m[2]]));
describe("cpanel-site/assets/site.css", () => {
  it.each([
    ["foreground", "background"],
    ["muted", "background"],
    ["muted", "surface"],
    ["muted-strong", "surface-light"],
    ["accent-ink", "background"],
    ["accent-ink", "accent-subtle"],
    ["success", "success-bg"],
  ])("--%s sobre --%s ≥ 4.5", (fg, bg) => {
    expect(contrastRatio(siteVars[fg], siteVars[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it("blanco sobre el botón primario ≥ 4.5", () => {
    expect(contrastRatio("#ffffff", siteVars["accent"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#ffffff", siteVars["accent-hover"])).toBeGreaterThanOrEqual(4.5);
  });
  it("no queda violeta de la paleta anterior", () => {
    expect(siteCss).not.toMatch(/5b34e6|4a26c9|eee9fe|d9cffc/i);
  });
});
