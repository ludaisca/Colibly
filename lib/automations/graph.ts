import { CONVERSATIONAL_STEPS, isBranching, type Branch, type Graph, type Step } from "./types";

interface Located {
  step: Step;
  list: Step[];
  index: number;
}

// Índice nodeId → posición. Se construye una vez por avance de la ejecución.
export class GraphIndex {
  private readonly byId = new Map<string, Located>();

  constructor(readonly graph: Graph) {
    const walk = (list: Step[]) => {
      list.forEach((step, index) => {
        this.byId.set(step.id, { step, list, index });
        if (isBranching(step)) step.branches.forEach((b) => walk(b.steps));
      });
    };
    walk(graph.steps);
  }

  get(nodeId: string): Step | null {
    return this.byId.get(nodeId)?.step ?? null;
  }

  has(nodeId: string): boolean {
    return this.byId.has(nodeId);
  }

  // Hermano siguiente en la misma lista; null = fin de esa cola (y de la
  // ejecución, porque las ramas no se reúnen).
  next(nodeId: string): string | null {
    const loc = this.byId.get(nodeId);
    if (!loc) return null;
    return loc.list[loc.index + 1]?.id ?? null;
  }

  first(): string | null {
    return this.graph.steps[0]?.id ?? null;
  }

  all(): Step[] {
    return [...this.byId.values()].map((l) => l.step);
  }
}

export function branchByKey(step: Step, key: string): Branch | null {
  return isBranching(step) ? (step.branches.find((b) => b.key === key) ?? null) : null;
}

// Primer paso de la rama; null si la rama está vacía (= la ejecución termina).
export function branchStart(step: Step, key: string): string | null {
  return branchByKey(step, key)?.steps[0]?.id ?? null;
}

export function isConversationalGraph(graph: Graph): boolean {
  return new GraphIndex(graph).all().some((s) => CONVERSATIONAL_STEPS.includes(s.type));
}

// ─── Plantillas de texto ────────────────────────────────────────────────────

export interface RenderContext {
  contact: { name: string | null; phone: string | null };
  vars: Record<string, string>;
  customFields: Record<string, string | null>;
}

// {{nombre}}, {{telefono}}, {{var.x}}, {{campo.key}}. Un placeholder
// desconocido se deja vacío en vez de mandarle "{{algo}}" al cliente.
export function renderText(template: string, ctx: RenderContext): string {
  const rendered = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, raw: string) => {
    const key = raw.toLowerCase();
    if (key === "nombre") return ctx.contact.name ?? "";
    if (key === "telefono") return ctx.contact.phone ?? "";
    if (key.startsWith("var.")) return ctx.vars[raw.slice(4)] ?? "";
    if (key.startsWith("campo.")) return ctx.customFields[raw.slice(6)] ?? "";
    return "";
  });
  // Un placeholder vacío no debe dejar "Hola , ¿qué tal?" ni dobles espacios.
  return rendered.replace(/[ \t]+([,.!?;:])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}

// Ids cortos y únicos para pasos/opciones/ramas creados en el editor. Cortos
// porque viajan como callback_data de Telegram (máx. 64 bytes).
export function shortId(prefix: string): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}_${out}`;
}
