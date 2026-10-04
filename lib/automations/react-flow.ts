import type { Edge, Node } from "@xyflow/react";
import { STEP_META, TRIGGER_META, stepLabel, triggerSummary, type StepGroup } from "./labels";
import { isBranching, type Graph, type Step } from "./types";
import type { ValidationIssue } from "./validate";

// React Flow es una vista del árbol ejecutable, no el formato persistido.
// El grafo original conserva el orden, la configuración y las ramas; las
// posiciones se calculan de nuevo a partir de él y jamás se envían a la API.
export interface AutomationFlowData extends Record<string, unknown> {
  label: string;
  description: string;
  category: StepGroup | "Disparador" | "Rama";
  branchLabels: { id: string; label: string; length: number }[];
  issueLevel: "error" | "warning" | null;
  listId: string;
  index: number;
  listLength: number;
  terminal: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export type AutomationFlowNode = Node<AutomationFlowData, "automation">;
export type AutomationFlowEdge = Edge;

const COLUMN_GAP = 270;
const ROW_GAP = 150;

function isTerminal(step: Step): boolean {
  return isBranching(step) || step.type === "ai_reply" || step.type === "handoff" || step.type === "end";
}

function leafRows(steps: Step[]): number {
  // Un paso con ramas es terminal en cada lista válida. En un borrador
  // inválido, medimos todas las ramas para no superponerlas ni ocultarlas.
  let rows = 1;
  for (const step of steps) {
    if (isBranching(step)) rows = Math.max(rows, step.branches.reduce((sum, branch) => sum + leafRows(branch.steps), 0));
  }
  return rows;
}

function issueLevel(issues: ValidationIssue[], nodeId: string | null): AutomationFlowData["issueLevel"] {
  const forNode = issues.filter((issue) => issue.nodeId === nodeId);
  return forNode.some((issue) => issue.level === "error") ? "error" : forNode.length > 0 ? "warning" : null;
}

export function graphToReactFlow(graph: Graph, issues: ValidationIssue[] = []): {
  nodes: AutomationFlowNode[];
  edges: AutomationFlowEdge[];
} {
  const nodes: AutomationFlowNode[] = [];
  const edges: AutomationFlowEdge[] = [];
  const center = (top: number, rows: number) => top + (rows - 1) * ROW_GAP / 2;

  const connect = (source: string, target: string, branch?: { id: string; label: string }) => {
    edges.push({
      id: `flow:${source}:${branch?.id ?? "next"}:${target}`,
      source, target,
      sourceHandle: branch?.id,
      label: branch?.label,
      type: "smoothstep",
    });
  };

  const placeList = (steps: Step[], x: number, top: number, source: string, listId: string, branch?: { id: string; label: string }) => {
    const rows = leafRows(steps);
    let previous = source;
    if (steps.length === 0) {
      const id = `empty:${branch?.id ?? "root"}`;
      nodes.push({ id, type: "automation", position: { x, y: center(top, rows) }, data: { label: "Añadir paso", description: "Esta rama todavía no tiene pasos", category: "Rama", branchLabels: [], issueLevel: null, listId, index: 0, listLength: 0, terminal: false, canMoveUp: false, canMoveDown: false } });
      connect(source, id, branch);
      return;
    }

    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      const id = step.id;
      nodes.push({
        id, type: "automation", position: { x: x + index * COLUMN_GAP, y: center(top, rows) },
        data: {
          label: STEP_META[step.type].label,
          description: stepLabel(step),
          category: STEP_META[step.type].group,
          branchLabels: isBranching(step) ? step.branches.map((item) => ({ id: item.id, label: item.label, length: item.steps.length })) : [],
          issueLevel: issueLevel(issues, step.id),
          listId, index, listLength: steps.length,
          terminal: isTerminal(step),
          canMoveUp: index > 0 && !isTerminal(step) && !isTerminal(steps[index - 1]),
          canMoveDown: index < steps.length - 1 && !isTerminal(step) && !isTerminal(steps[index + 1]),
        },
      });
      // Un paso ramificado seguido de otro hermano es un borrador inválido.
      // No dibujamos una conexión de ejecución que en realidad no existe.
      if (index === 0 || !isBranching(steps[index - 1])) connect(previous, id, index === 0 ? branch : undefined);
      previous = id;

      if (isBranching(step)) {
        let branchTop = top;
        for (const child of step.branches) {
          placeList(child.steps, x + (index + 1) * COLUMN_GAP, branchTop, id, child.id, { id: child.id, label: child.label });
          branchTop += leafRows(child.steps) * ROW_GAP;
        }
      }
    }
  };

  const rows = leafRows(graph.steps);
  nodes.push({
    id: "trigger", type: "automation", position: { x: 0, y: center(0, rows) },
    data: {
      label: TRIGGER_META[graph.trigger.type].label,
      description: triggerSummary(graph.trigger),
      category: "Disparador",
      branchLabels: [],
      issueLevel: issueLevel(issues, null),
      listId: "root", index: 0, listLength: graph.steps.length,
      terminal: false, canMoveUp: false, canMoveDown: false,
    },
  });
  placeList(graph.steps, COLUMN_GAP, 0, "trigger", "root");
  return { nodes, edges };
}
