import { describe, expect, it } from "vitest";
import { graphToReactFlow } from "../react-flow";
import { AUTOMATION_TEMPLATES } from "../templates";
import { isBranching, type Step } from "../types";
import { buttons, graph, text } from "./helpers";

function countSteps(steps: Step[]): number {
  return steps.reduce((total, step) => total + 1 + (isBranching(step) ? step.branches.reduce((sum, branch) => sum + countSteps(branch.steps), 0) : 0), 0);
}

describe("graphToReactFlow", () => {
  it("conserva el orden de una secuencia y referencia los ids originales", () => {
    const view = graphToReactFlow(graph([text("a", "Hola"), text("b", "Adiós")]));
    expect(view.nodes.map((node) => node.id)).toEqual(["trigger", "a", "b"]);
    expect(view.edges.map((edge) => [edge.source, edge.target])).toEqual([["trigger", "a"], ["a", "b"]]);
    expect(view.nodes[0].position.x).toBeLessThan(view.nodes[1].position.x);
    expect(view.nodes.find((node) => node.id === "a")?.data).toMatchObject({ listId: "root", index: 0, listLength: 2, canMoveDown: true });
  });

  it("separa ramas, etiqueta conexiones y hace visibles las ramas vacías", () => {
    const choice = buttons("question", ["Sí", "No"], { "Sí": [text("accepted", "Perfecto")] });
    const view = graphToReactFlow(graph([choice]));
    const fromChoice = view.edges.filter((edge) => edge.source === "question");
    expect(fromChoice.map((edge) => edge.label)).toEqual(["Sí", "No", "Otra respuesta", "Sin respuesta"]);
    expect(fromChoice[0].target).toBe("accepted");
    expect(fromChoice.slice(1).every((edge) => edge.target.startsWith("empty:"))).toBe(true);
    expect(new Set(view.nodes.map((node) => node.position.y)).size).toBeGreaterThan(1);
    expect(view.nodes.find((node) => node.id === "accepted")?.data).toMatchObject({ index: 0, listLength: 1 });
    expect(view.nodes.find((node) => node.id === fromChoice[1].target)?.data).toMatchObject({ listId: fromChoice[1].sourceHandle, index: 0 });
  });

  it("proyecta cada paso de una plantilla anidada sin unir ramas", () => {
    const template = AUTOMATION_TEMPLATES.find((item) => item.id === "welcome_menu")!;
    const source = template.build();
    const view = graphToReactFlow(source);
    expect(view.nodes.filter((node) => node.id !== "trigger" && !node.id.startsWith("empty:")).length).toBe(countSteps(source.steps));
    expect(view.edges.some((edge) => edge.label === "Respondió")).toBe(true);
    const targets = view.edges.map((edge) => edge.target);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("marca errores y avisos en los nodos adecuados", () => {
    const view = graphToReactFlow(graph([text("a", "Hola")]), [
      { nodeId: null, level: "warning", message: "Disparador" },
      { nodeId: "a", level: "warning", message: "Aviso" },
      { nodeId: "a", level: "error", message: "Error" },
    ]);
    expect(view.nodes.find((node) => node.id === "trigger")?.data.issueLevel).toBe("warning");
    expect(view.nodes.find((node) => node.id === "a")?.data.issueLevel).toBe("error");
  });
});
