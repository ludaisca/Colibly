import type { TemplateCreateInput } from "@/lib/validations";
import { httpTimeout } from "@/lib/http-timeouts";
import { GRAPH_API_BASE } from "@/lib/meta/graph";

const GRAPH_API = GRAPH_API_BASE;

interface MetaTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  example?: { header_handle: string[] } | { header_text: string[] } | { body_text: string[][] };
  buttons?: MetaButton[];
}

interface MetaButton {
  type: string;
  text: string;
  url?: string;
  example?: string[];
}

interface MetaTemplatePayload {
  name: string;
  language: string;
  category: string;
  components: MetaTemplateComponent[];
}

interface MetaError {
  error?: { message?: string; error_user_msg?: string };
}

const VARIABLE = /\{\{(\d+)\}\}/g;

function variableNumbers(text: string | undefined): number[] {
  return [...new Set([...(text ?? "").matchAll(VARIABLE)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/** Variables {{1}}…{{n}} seguidas y sin huecos, como exige Meta. */
function isSequential(nums: number[]): boolean {
  return nums.every((n, i) => n === i + 1);
}

/**
 * Lo que Meta rechazaría después de crear (y tarda en decirlo): se valida antes
 * con el mismo mensaje que vería la persona. null = todo bien. Puro.
 */
export function templateInputError(input: TemplateCreateInput): string | null {
  const { header, body, bodyExamples, buttons } = input.components;

  const bodyVars = variableNumbers(body);
  if (!isSequential(bodyVars)) return "Las variables del cuerpo deben ser {{1}}, {{2}}… seguidas y sin saltos";
  if (bodyVars.length > 0 && (bodyExamples?.length ?? 0) !== bodyVars.length) {
    return `Debes dar un ejemplo para cada variable del cuerpo (${bodyVars.length} requerido(s))`;
  }
  if (bodyVars.length > 0 && bodyExamples!.some((e) => !e.trim())) return "Meta exige un valor de ejemplo para cada variable del cuerpo";

  if (header?.format === "TEXT") {
    if (!header.text?.trim()) return "Escribe el texto de la cabecera";
    const headerVars = variableNumbers(header.text);
    if (headerVars.length > 1 || (headerVars.length === 1 && headerVars[0] !== 1)) {
      return "La cabecera de texto admite una sola variable: {{1}}";
    }
    if (headerVars.length === 1 && !header.exampleText?.trim()) return "Escribe un ejemplo para la variable {{1}} de la cabecera";
  } else if (header && !header.exampleHandle) {
    return "Sube un archivo de ejemplo para la cabecera";
  }

  for (const [i, b] of (buttons ?? []).entries()) {
    if (b.type !== "URL") continue;
    const n = i + 1;
    if (!b.url?.trim()) return `El botón ${n} necesita una URL`;
    const dynamic = b.url.includes("{{");
    const staticUrl = b.url.replace(/\{\{1\}\}$/, "");
    try {
      const parsed = new URL(staticUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocolo");
    } catch {
      return `La URL del botón ${n} no es válida`;
    }
    if (dynamic) {
      if (!/\{\{1\}\}$/.test(b.url) || (b.url.match(VARIABLE)?.length ?? 0) !== 1) {
        return `La URL del botón ${n} admite una sola variable y al final: https://tusitio.com/{{1}}`;
      }
      if (!b.urlExample?.trim()) return `Escribe una URL de ejemplo para el botón ${n} (con la variable ya resuelta)`;
      try {
        const base = new URL(staticUrl);
        const ex = new URL(b.urlExample);
        if (ex.origin !== base.origin) throw new Error("dominio");
      } catch {
        return `El ejemplo del botón ${n} debe ser una URL del mismo dominio que la del botón`;
      }
    }
  }
  return null;
}

export function buildPayload(input: TemplateCreateInput): MetaTemplatePayload {
  const components: MetaTemplateComponent[] = [];

  if (input.components.header) {
    const h = input.components.header;
    if (h.format === "TEXT") {
      const hasVariable = variableNumbers(h.text).length > 0;
      components.push(
        hasVariable
          ? { type: "HEADER", format: "TEXT", text: h.text, example: { header_text: [h.exampleText ?? ""] } }
          : { type: "HEADER", format: "TEXT", text: h.text }
      );
    } else {
      components.push({
        type: "HEADER",
        format: h.format,
        example: { header_handle: [h.exampleHandle ?? ""] },
      });
    }
  }

  const bodyVariableCount = new Set(input.components.body.match(/\{\{(\d+)\}\}/g)).size;
  if (bodyVariableCount > 0) {
    components.push({
      type: "BODY",
      text: input.components.body,
      example: { body_text: [input.components.bodyExamples ?? []] },
    });
  } else {
    components.push({ type: "BODY", text: input.components.body });
  }

  if (input.components.footer) {
    components.push({ type: "FOOTER", text: input.components.footer });
  }

  if (input.components.buttons && input.components.buttons.length > 0) {
    const buttons: MetaButton[] = input.components.buttons.map((b) => {
      if (b.type === "URL") {
        const url = b.url ?? "";
        return url.includes("{{") ? { type: "URL", text: b.text, url, example: [b.urlExample ?? ""] } : { type: "URL", text: b.text, url };
      }
      return { type: "QUICK_REPLY", text: b.text };
    });
    components.push({ type: "BUTTONS", buttons });
  }

  return {
    name: input.name,
    language: input.language,
    category: input.category,
    components,
  };
}

export async function createTemplate(
  wabaId: string,
  accessToken: string,
  input: TemplateCreateInput
): Promise<{ success: true; templateId: string; components: object } | { success: false; error: string }> {
  const payload = buildPayload(input);

  const url = `${GRAPH_API}/${wabaId}/message_templates`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: httpTimeout(),
  });

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
  } & MetaError;

  if (!res.ok) {
    const msg = json.error?.error_user_msg ?? json.error?.message ?? "Error al crear la plantilla en Meta";
    return { success: false, error: msg };
  }

  if (!json.id) {
    return { success: false, error: "Meta no retornó un ID de plantilla" };
  }

  return {
    success: true,
    templateId: json.id,
    components: payload.components,
  };
}
