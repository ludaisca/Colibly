// Formato de texto de WhatsApp: *negrita*, _cursiva_, ~tachado~, `código` y
// ```monoespaciado``` (bloque, puede cruzar líneas). Puro y sin React: la UI
// convierte el árbol en elementos (app/components/whatsapp/whatsapp-text.tsx),
// así que nunca se inyecta HTML.
//
// Reglas (las de WhatsApp): el marcador de apertura va al inicio o tras algo
// que no sea letra/número y no puede ir seguido de espacio; el de cierre no
// puede ir precedido de espacio ni seguido de letra/número; el formato en
// línea no cruza saltos de línea. Así "2*3*4" o "snake_case_name" quedan tal cual.

export type FormatKind = "bold" | "italic" | "strike" | "code" | "mono";
export type FormatNode = string | { kind: FormatKind; children: FormatNode[] };

const INLINE: Record<string, FormatKind> = { "*": "bold", _: "italic", "~": "strike", "`": "code" };
const WORD = /[\p{L}\p{N}]/u;

function isWord(ch: string | undefined): boolean {
  return ch !== undefined && WORD.test(ch);
}

function isSpace(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

function findClose(text: string, open: number, marker: string): number {
  for (let j = open + 2; j < text.length; j++) {
    const ch = text[j];
    if (ch === "\n") return -1;
    if (ch === marker && !isSpace(text[j - 1]) && !isWord(text[j + 1])) return j;
  }
  return -1;
}

function parseInline(text: string): FormatNode[] {
  const out: FormatNode[] = [];
  let buf = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const kind = INLINE[ch];
    if (kind && !isWord(text[i - 1]) && !isSpace(text[i + 1])) {
      const close = findClose(text, i, ch);
      if (close !== -1) {
        if (buf) out.push(buf);
        buf = "";
        const inner = text.slice(i + 1, close);
        out.push({ kind, children: kind === "code" ? [inner] : parseInline(inner) });
        i = close + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  if (buf) out.push(buf);
  return out;
}

export function parseWhatsAppFormat(text: string): FormatNode[] {
  const out: FormatNode[] = [];
  const mono = /```([\s\S]+?)```/g;
  let last = 0;
  for (let match = mono.exec(text); match; match = mono.exec(text)) {
    if (match.index > last) out.push(...parseInline(text.slice(last, match.index)));
    out.push({ kind: "mono", children: [match[1]] });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(...parseInline(text.slice(last)));
  return out;
}

/** ¿El texto trae algún formato? (para no envolver de más). */
export function hasWhatsAppFormat(text: string): boolean {
  return parseWhatsAppFormat(text).some((node) => typeof node !== "string");
}

// ── Edición: envolver la selección del compositor ─────────────────────────

export const FORMAT_MARKERS: Record<Exclude<FormatKind, "code">, string> = {
  bold: "*",
  italic: "_",
  strike: "~",
  mono: "```",
};

/**
 * Envuelve [start, end) con el marcador. Los espacios de los bordes quedan
 * fuera (WhatsApp no formatea "* hola*"). Si la selección ya está envuelta con
 * ese marcador, lo quita (alternar). Devuelve el texto y la nueva selección.
 */
export function toggleFormat(
  text: string,
  start: number,
  end: number,
  kind: Exclude<FormatKind, "code">
): { text: string; start: number; end: number } {
  const marker = FORMAT_MARKERS[kind];
  const m = marker.length;
  let s = Math.min(start, end);
  let e = Math.max(start, end);
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;

  // Ya envuelto por fuera: *[hola]* → hola
  if (s >= m && text.slice(s - m, s) === marker && text.slice(e, e + m) === marker) {
    return { text: text.slice(0, s - m) + text.slice(s, e) + text.slice(e + m), start: s - m, end: e - m };
  }
  // La selección incluye los marcadores: [*hola*] → hola
  if (e - s >= 2 * m + 1 && text.slice(s, s + m) === marker && text.slice(e - m, e) === marker) {
    return { text: text.slice(0, s) + text.slice(s + m, e - m) + text.slice(e), start: s, end: e - 2 * m };
  }
  if (s === e) {
    // Sin selección: inserta el par y deja el cursor en medio.
    return { text: text.slice(0, s) + marker + marker + text.slice(s), start: s + m, end: s + m };
  }
  return { text: text.slice(0, s) + marker + text.slice(s, e) + marker + text.slice(e), start: s + m, end: e + m };
}
