// Contraste WCAG 2.x entre colores hex y lectura de los tokens de
// app/globals.css, para que un cambio de paleta no rompa la legibilidad sin
// que nadie lo note (ver lib/design/__tests__/contrast.test.ts).

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Color no soportado: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function readBlock(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!block) throw new Error(`No se encontró el bloque ${selector}`);
  const raw: Record<string, string> = {};
  for (const m of block[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) raw[m[1]] = m[2].trim();
  return raw;
}

/**
 * Lee los primitivos (`:root`), los semánticos claros (`:root, .theme-light`)
 * y, si se pide un tema, los del bloque de ese selector encima (p. ej.
 * ".dark"); resuelve las referencias `var(--x)` hasta llegar a un hex. Los
 * valores que no terminan en hex (sombras, radios, oklch) se dejan tal cual.
 */
export function readThemeTokens(css: string, themeSelector?: string | string[]): Record<string, string> {
  const layers = themeSelector === undefined ? [] : Array.isArray(themeSelector) ? themeSelector : [themeSelector];
  const raw: Record<string, string> = {
    ...readBlock(css, ":root"),
    ...readBlock(css, ":root, .theme-light"),
  };
  for (const selector of layers) Object.assign(raw, readBlock(css, selector));

  const resolve = (name: string, seen: Set<string>): string => {
    const value = raw[name];
    if (value === undefined) throw new Error(`Token sin definir: --${name}`);
    const ref = value.match(/^var\(--([\w-]+)\)$/);
    if (!ref) return value;
    if (seen.has(ref[1])) throw new Error(`Referencia circular en --${name}`);
    return resolve(ref[1], new Set(seen).add(ref[1]));
  };
  return Object.fromEntries(Object.keys(raw).map((k) => [k, resolve(k, new Set([k]))]));
}
