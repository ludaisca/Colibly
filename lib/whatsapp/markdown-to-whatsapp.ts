// Markdown de modelo → formato de WhatsApp. Los modelos responden con
// **negrita**, __negrita__, ## títulos, [texto](url) y listas con "* ", que
// WhatsApp no interpreta: el cliente veía los asteriscos crudos. Se aplica a
// todo texto de bot o IA antes de enviarlo a un canal (y en "Probar", para que
// la prueba se vea igual). Lo que ya va en formato de WhatsApp (*negrita*,
// _cursiva_, ~tachado~) se deja tal cual; los bloques de código, también. Puro.

function convertPlain(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      // Línea horizontal (---, ***, ___) → nada.
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return "";
      let l = line;
      // ## Título → *Título*
      l = l.replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/, (_m, title: string) => `*${title.replace(/\*\*/g, "")}*`);
      // Viñetas "* " o "+ " → "- " (un "* " al inicio podría leerse como negrita).
      l = l.replace(/^(\s*)[*+]\s+/, "$1- ");
      // Imágenes y enlaces.
      l = l.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_m, alt: string, url: string) => (alt ? `${alt} (${url})` : url));
      l = l.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, label: string, url: string) => (label.trim() === url ? url : `${label} (${url})`));
      // **negrita** / __negrita__ → *negrita*; ~~tachado~~ → ~tachado~.
      l = l.replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, "*$1*");
      l = l.replace(/(?<![\p{L}\p{N}])__(?=\S)([^_\n]+?)(?<=\S)__(?![\p{L}\p{N}])/gu, "*$1*");
      l = l.replace(/~~(?=\S)([^~\n]+?)(?<=\S)~~/g, "~$1~");
      return l;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Convierte las partes fuera de bloques ``` y de `código` en línea. */
export function markdownToWhatsApp(text: string): string {
  if (!text) return text;
  return text
    .split(/(```[\s\S]*?```)/)
    .map((block, i) => {
      if (i % 2 === 1) return block;
      return block
        .split(/(`[^`\n]+`)/)
        .map((part, j) => (j % 2 === 1 ? part : convertPlain(part)))
        .join("");
    })
    .join("")
    .trim();
}
