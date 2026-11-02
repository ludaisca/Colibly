// Formato de importes mientras se escribe (portado de `tsl-currency` de
// Tesela). Puro: lo usa <CurrencyInput> y se prueba sin DOM. Pesos mexicanos,
// es-MX: separador de miles "," y decimal ".", 2 decimales.

export interface ParsedAmount {
  int: string;
  frac: string;
  dot: boolean;
}

const DECIMAL = ".";
const GROUP = ",";
export const CURRENCY_DIGITS = 2;

/** Normaliza lo escrito (o pegado): solo dígitos, un separador decimal, máx. 2 decimales. Sin negativos. */
export function parseAmount(text: string): ParsedAmount {
  let int = "";
  let frac = "";
  let dot = false;
  for (const ch of String(text)) {
    if (ch === DECIMAL) dot = true;
    else if (/\d/.test(ch)) {
      if (dot) {
        if (frac.length < CURRENCY_DIGITS) frac += ch;
      } else int += ch;
    }
  }
  int = int.replace(/^0+(?=\d)/, "");
  return { int, frac, dot };
}

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
}

/** Texto visible. `pad` completa los decimales (al salir del campo). */
export function renderAmount({ int, frac, dot }: ParsedAmount, pad: boolean): string {
  if (!int && !frac && !dot) return "";
  let out = group(int || "0");
  if (pad) out += DECIMAL + frac.padEnd(CURRENCY_DIGITS, "0");
  else if (dot) out += DECIMAL + frac;
  return out;
}

/** Valor canónico ("1250.50") o "" si está vacío. */
export function amountValue(text: string): string {
  const { int, frac } = parseAmount(text);
  if (!int && !frac) return "";
  return `${int || "0"}.${frac.padEnd(CURRENCY_DIGITS, "0")}`;
}

/** De un número (o texto canónico) al texto visible con decimales. */
export function formatAmountValue(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return "";
  const [int, frac = ""] = Math.abs(n).toFixed(CURRENCY_DIGITS).split(".");
  return renderAmount({ int, frac, dot: true }, true);
}

/**
 * Reformatea mientras se escribe y devuelve dónde dejar el cursor: cuenta los
 * caracteres con significado (dígitos y punto) antes del cursor y lo pone
 * tras el mismo número de caracteres en el texto nuevo.
 */
export function reformatWithCaret(raw: string, caret: number): { text: string; caret: number } {
  const significant = (s: string) => [...s].filter((c) => /\d/.test(c) || c === DECIMAL).length;
  const before = significant(raw.slice(0, caret));
  const text = renderAmount(parseAmount(raw), false);
  let pos = 0;
  let seen = 0;
  while (pos < text.length && seen < before) {
    if (/\d/.test(text[pos]) || text[pos] === DECIMAL) seen += 1;
    pos += 1;
  }
  return { text, caret: pos };
}
