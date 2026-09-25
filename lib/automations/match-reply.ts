import type { Option } from "./types";

// Empareja la respuesta del cliente con una opción de un paso de botones/lista.
// Orden: id interactivo (tocó el botón) → texto igual al de la opción (escribió
// "Masaje" o "masaje") → número ("2", "2.", "opción 2"). La IA como último
// recurso vive en el ejecutor (necesita red); esto es puro.

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchOption(options: Option[], reply: { text: string; replyId: string | null }): Option | null {
  if (reply.replyId) {
    const byId = options.find((o) => o.id === reply.replyId);
    if (byId) return byId;
  }
  const text = normalize(reply.text);
  if (!text) return null;

  const byTitle = options.find((o) => normalize(o.title) === text);
  if (byTitle) return byTitle;

  const numeric = text.match(/^(?:opcion |la |el |numero )?(\d{1,2})$/);
  if (numeric) {
    const n = Number(numeric[1]);
    if (n >= 1 && n <= options.length) return options[n - 1];
  }
  return null;
}

// Menú numerado para canales/situaciones sin botones nativos (y para el
// reintento "no entendí"): "1. Facial\n2. Masaje".
export function numberedMenu(options: Option[]): string {
  return options.map((o, i) => `${i + 1}. ${o.title}`).join("\n");
}

export type FreeReplyValidation = "any" | "number" | "email" | "phone";

// Valida y normaliza una respuesta libre. `value` es lo que se guarda.
export function validateFreeReply(text: string, validation: FreeReplyValidation): { ok: boolean; value: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, value: "" };
  switch (validation) {
    case "any":
      return { ok: true, value: trimmed };
    case "number": {
      // "$1,500.50", "1 500", "1500" → 1500.50 / 1500. Coma como separador de
      // miles solo si le siguen exactamente 3 dígitos; si no, es decimal.
      let s = trimmed.replace(/[$\s]/g, "").replace(/mxn|usd|pesos?/gi, "");
      s = s.replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
      return /^-?\d+(\.\d+)?$/.test(s) ? { ok: true, value: String(Number(s)) } : { ok: false, value: "" };
    }
    case "email": {
      const email = trimmed.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? { ok: true, value: email } : { ok: false, value: "" };
    }
    case "phone": {
      const digits = trimmed.replace(/\D/g, "");
      return digits.length >= 8 && digits.length <= 15 ? { ok: true, value: digits } : { ok: false, value: "" };
    }
  }
}
