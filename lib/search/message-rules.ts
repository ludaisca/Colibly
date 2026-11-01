// Reglas puras de la búsqueda en mensajes (sin Prisma; testeables).

/** Menos de 3 caracteres no aprovecha el índice trigram. */
export const MESSAGE_SEARCH_MIN = 3;
export const MESSAGE_SEARCH_MAX = 100;

/** Recorta y colapsa espacios; null si queda fuera de rango. */
export function normalizeMessageQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? "").replace(/\s+/g, " ").trim();
  if (q.length < MESSAGE_SEARCH_MIN || q.length > MESSAGE_SEARCH_MAX) return null;
  return q;
}

/**
 * Escapa los comodines de LIKE (`%`, `_`) y el propio escape (`\`): Prisma
 * `contains` no lo hace, y un "50%" buscaría cualquier cosa que empiece en 50.
 * Se usa con `ESCAPE '\'`.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Fragmento alrededor de la primera coincidencia (sin distinguir mayúsculas)
 * en el primer campo que la contenga: texto, pie de foto o transcripción.
 */
export function messageSnippet(fields: Array<string | null | undefined>, query: string, radius = 60): string {
  const needle = query.toLocaleLowerCase("es");
  for (const field of fields) {
    if (!field) continue;
    const text = field.replace(/\s+/g, " ").trim();
    const at = text.toLocaleLowerCase("es").indexOf(needle);
    if (at === -1) continue;
    const start = Math.max(0, at - radius);
    const end = Math.min(text.length, at + needle.length + radius);
    return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  }
  const first = fields.find((f) => f && f.trim())?.replace(/\s+/g, " ").trim() ?? "";
  return first.length > radius * 2 ? `${first.slice(0, radius * 2)}…` : first;
}
