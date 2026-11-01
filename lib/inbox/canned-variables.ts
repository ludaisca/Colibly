import { isFallbackName } from "@/lib/whatsapp/contact-name";

// Variables de las respuestas rápidas (F5). Misma sintaxis que las
// automatizaciones ({{nombre}}), pero al revés en lo desconocido: aquí el
// agente ve el texto antes de mandarlo, así que una variable que no existe se
// deja tal cual (y la ve) en vez de borrarse en silencio.

export const CANNED_VARIABLES = [
  { key: "nombre", label: "Nombre del contacto" },
  { key: "agente", label: "Tu nombre" },
  { key: "negocio", label: "Nombre del negocio" },
] as const;

export interface CannedContext {
  /** Nombre del chat; si es solo el número (fallback), cuenta como vacío. */
  contactName: string | null;
  remoteJid: string;
  agentName: string | null;
  businessName: string | null;
}

export function renderCannedResponse(template: string, ctx: CannedContext): string {
  const values: Record<string, string> = {
    nombre: isFallbackName(ctx.contactName, ctx.remoteJid) ? "" : (ctx.contactName ?? "").trim(),
    agente: (ctx.agentName ?? "").trim(),
    negocio: (ctx.businessName ?? "").trim(),
  };
  let replacedEmpty = false;
  const rendered = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, raw: string) => {
    const key = raw.toLowerCase();
    if (!(key in values)) return match;
    if (!values[key]) replacedEmpty = true;
    return values[key];
  });
  // Un valor vacío no debe dejar "Hola , ¿qué tal?" ni dobles espacios.
  return replacedEmpty ? rendered.replace(/[ \t]+([,.!?;:])/g, "$1").replace(/[ \t]{2,}/g, " ") : rendered;
}
