import { shortId } from "@/lib/automations/graph";
import { isBranching, type Branch, type Graph, type Step, type StepType } from "@/lib/automations/types";

// Operaciones inmutables sobre el árbol para el constructor. Una "lista" se
// identifica por "root" o por el id de la rama que la contiene.

export const ROOT = "root";

// Pasos que solo pueden ir al final de su columna: los que abren ramas y los
// que terminan la automatización.
export function isTerminalType(type: StepType): boolean {
  return ["send_buttons", "send_list", "wait_for_reply", "condition", "ai_classify", "ai_reply", "handoff", "end"].includes(type);
}

export function isTerminal(step: Step): boolean {
  return isTerminalType(step.type);
}

function mapLists(steps: Step[], listId: string, current: string, fn: (list: Step[]) => Step[]): Step[] {
  const base = current === listId ? fn(steps) : steps;
  return base.map((s) =>
    isBranching(s) ? ({ ...s, branches: s.branches.map((b) => ({ ...b, steps: mapLists(b.steps, listId, b.id, fn) })) } as Step) : s
  );
}

export function insertStep(graph: Graph, listId: string, index: number, step: Step): Graph {
  return { ...graph, steps: mapLists(graph.steps, listId, ROOT, (list) => [...list.slice(0, index), step, ...list.slice(index)]) };
}

function mapSteps(steps: Step[], fn: (s: Step) => Step | null): Step[] {
  const out: Step[] = [];
  for (const s of steps) {
    const mapped = fn(s);
    if (!mapped) continue;
    out.push(isBranching(mapped) ? ({ ...mapped, branches: mapped.branches.map((b) => ({ ...b, steps: mapSteps(b.steps, fn) })) } as Step) : mapped);
  }
  return out;
}

export function removeStep(graph: Graph, stepId: string): Graph {
  return { ...graph, steps: mapSteps(graph.steps, (s) => (s.id === stepId ? null : s)) };
}

export function updateStep(graph: Graph, stepId: string, fn: (s: Step) => Step): Graph {
  return { ...graph, steps: mapSteps(graph.steps, (s) => (s.id === stepId ? syncBranches(fn(s)) : s)) };
}

export function moveStep(graph: Graph, stepId: string, delta: -1 | 1): Graph {
  const moveIn = (list: Step[]): Step[] => {
    const i = list.findIndex((s) => s.id === stepId);
    if (i >= 0) {
      const j = i + delta;
      if (j < 0 || j >= list.length || isTerminal(list[i]) || isTerminal(list[j])) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    }
    return list.map((s) => (isBranching(s) ? ({ ...s, branches: s.branches.map((b) => ({ ...b, steps: moveIn(b.steps) })) } as Step) : s));
  };
  return { ...graph, steps: moveIn(graph.steps) };
}

export function findStep(graph: Graph, stepId: string): Step | null {
  const walk = (list: Step[]): Step | null => {
    for (const s of list) {
      if (s.id === stepId) return s;
      if (isBranching(s)) for (const b of s.branches) {
        const f = walk(b.steps);
        if (f) return f;
      }
    }
    return null;
  };
  return walk(graph.steps);
}

interface StepLocation { listId: string; index: number; step: Step }

function findLocation(graph: Graph, stepId: string): StepLocation | null {
  const walk = (list: Step[], listId: string): StepLocation | null => {
    for (let index = 0; index < list.length; index++) {
      const step = list[index];
      if (step.id === stepId) return { listId, index, step };
      if (isBranching(step)) for (const branch of step.branches) {
        const found = walk(branch.steps, branch.id);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(graph.steps, ROOT);
}

function findList(graph: Graph, listId: string): Step[] | null {
  if (listId === ROOT) return graph.steps;
  const walk = (list: Step[]): Step[] | null => {
    for (const step of list) if (isBranching(step)) for (const branch of step.branches) {
      if (branch.id === listId) return branch.steps;
      const found = walk(branch.steps);
      if (found) return found;
    }
    return null;
  };
  return walk(graph.steps);
}

// Una conexión del lienzo significa «mueve el destino inmediatamente después
// del origen»; si sale de una rama, significa «al inicio de esa rama». El
// formato ejecutable es un árbol, así que no admitimos uniones ni ciclos.
export function connectStep(graph: Graph, sourceId: string, targetId: string, sourceHandle?: string | null): { graph: Graph; error?: string } {
  if (targetId === "trigger" || targetId.startsWith("empty:") || sourceId.startsWith("empty:")) {
    return { graph, error: "Conecta dos pasos existentes; usa Añadir paso para crear uno" };
  }
  const target = findLocation(graph, targetId);
  if (!target) return { graph, error: "El paso de destino ya no existe" };
  if (sourceId === targetId) return { graph, error: "Un paso no puede conectarse consigo mismo" };

  // Al quitar primero el destino, un origen que era descendiente suyo
  // desaparece. Esto evita ciclos incluso entre ramas anidadas.
  const withoutTarget = removeStep(graph, targetId);
  if (sourceId !== "trigger" && !findLocation(withoutTarget, sourceId)) {
    return { graph, error: "No puedes conectar un paso con uno de sus descendientes" };
  }

  let listId = ROOT;
  let index = 0;
  if (sourceId !== "trigger") {
    const source = findLocation(withoutTarget, sourceId)!;
    if (isBranching(source.step)) {
      if (!sourceHandle || !source.step.branches.some((branch) => branch.id === sourceHandle)) {
        return { graph, error: "Elige una salida válida de la rama" };
      }
      listId = sourceHandle;
    } else {
      if (sourceHandle) return { graph, error: "Este paso no tiene esa salida" };
      if (isTerminal(source.step)) return { graph, error: "Este paso termina la automatización" };
      listId = source.listId;
      index = source.index + 1;
    }
  } else if (sourceHandle) {
    return { graph, error: "El disparador no tiene ramas" };
  }

  const destination = findList(withoutTarget, listId);
  if (!destination) return { graph, error: "La rama de destino ya no existe" };
  if (isTerminal(target.step) && index < destination.length) {
    return { graph, error: "Este paso solo puede ir al final de la columna" };
  }
  const next = insertStep(withoutTarget, listId, index, target.step);
  return { graph: next };
}

// Mantiene una rama por opción/categoría: conserva los pasos de las que
// siguen existiendo, crea ramas vacías para las nuevas, quita las sobrantes.
export function syncBranches(step: Step): Step {
  let wanted: { key: string; label: string }[] | null = null;
  if (step.type === "send_buttons" || step.type === "send_list") {
    wanted = [...step.config.options.map((o) => ({ key: o.id, label: o.title || "Opción" })), { key: "other", label: "Otra respuesta" }, { key: "timeout", label: "Sin respuesta" }];
  } else if (step.type === "ai_classify") {
    wanted = [...step.config.categories.map((c) => ({ key: c.id, label: c.label || "Categoría" })), { key: "other", label: "Otro" }];
  }
  if (!wanted || !isBranching(step)) return step;
  const branches: Branch[] = wanted.map(({ key, label }) => {
    const existing = step.branches.find((b) => b.key === key);
    return existing ? { ...existing, label } : { id: shortId("b"), key, label, steps: [] };
  });
  return { ...step, branches } as Step;
}

const branch = (key: string, label: string): Branch => ({ id: shortId("b"), key, label, steps: [] });

export function createStep(type: StepType): Step {
  const id = shortId("s");
  switch (type) {
    case "send_text":
      return { id, type, config: { text: "" } };
    case "send_buttons":
    case "send_list": {
      const options = [
        { id: shortId("o"), title: "Opción 1" },
        { id: shortId("o"), title: "Opción 2" },
      ];
      const common = { text: "", options, timeoutMinutes: 24 * 60, fallback: "reprompt" as const, aiMatch: true };
      const step =
        type === "send_buttons"
          ? ({ id, type, config: common, branches: [] } as Step)
          : ({ id, type, config: { ...common, buttonLabel: "Ver opciones" }, branches: [] } as Step);
      return syncBranches(step);
    }
    case "send_template":
      return { id, type, config: { templateId: "", bodyParams: [] } };
    case "wait":
      return { id, type, config: { minutes: 60 } };
    case "wait_for_reply":
      return {
        id,
        type,
        config: { timeoutMinutes: 24 * 60, validation: "any", saveToVar: "respuesta_cliente", saveToCustomField: null, invalidMessage: null },
        branches: [branch("answered", "Respondió"), branch("timeout", "Sin respuesta")],
      };
    case "condition":
      return {
        id,
        type,
        config: { match: "all", rules: [{ subject: "tag", op: "equals", key: null, value: "" }] },
        branches: [branch("yes", "Sí"), branch("no", "No")],
      };
    case "add_tag":
    case "remove_tag":
      return { id, type, config: { tagName: "" } };
    case "set_deal_stage":
      return { id, type, config: { stageId: "", lostReasonId: null } };
    case "create_task":
      return { id, type, config: { title: "Dar seguimiento a {{nombre}}", kind: "TODO", dueInMinutes: 1440, assignee: "owner", userId: null } };
    case "set_custom_field":
      return { id, type, config: { key: "", value: "" } };
    case "assign":
      return { id, type, config: { mode: "auto", userId: null } };
    case "notify_team":
      return { id, type, config: { target: "assignee", userId: null, title: "{{nombre}} necesita atención", body: "" } };
    case "ai_classify":
      return syncBranches({
        id,
        type,
        config: {
          instructions: "",
          categories: [
            { id: shortId("c"), label: "Precios", description: "" },
            { id: shortId("c"), label: "Cita", description: "" },
          ],
        },
        branches: [],
      });
    case "ai_extract":
      return { id, type, config: { what: "", format: "text", saveToVar: "dato", saveToCustomField: null } };
    case "score_lead":
      return { id, type, config: { scorerId: "" } };
    case "webhook":
      return { id, type, config: { url: "https://", method: "POST", body: '{\n  "contacto": "{{nombre}}",\n  "telefono": "{{telefono}}"\n}', saveToVar: "respuesta" } };
    case "ai_reply":
      return { id, type, config: {} };
    case "handoff":
      return { id, type, config: { message: "Te comunico con una persona del equipo 🙌", assign: "auto" } };
    case "end":
      return { id, type, config: {} };
  }
}
