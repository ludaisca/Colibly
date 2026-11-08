// Plurales en español sin "(s)"/"(es)" (revisión de pantallas, 2026-11-07).
// `plural(3, "chat")` → "3 chats"; `plural(1, "canal", "canales")` → "1 canal".
// Sin forma plural explícita se añade "s" (vale para vocales y préstamos como
// chat o bot); para "canal", "organización", "vez"… pasa el plural.

export function pluralWord(count: number, singular: string, pluralForm?: string): string {
  if (Math.abs(count) === 1) return singular;
  return pluralForm ?? singular + "s";
}

/** Cantidad + palabra: "1 chat", "2 chats", "0 chats". */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count.toLocaleString("es-MX")} ${pluralWord(count, singular, pluralForm)}`;
}
