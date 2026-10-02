import { describe, expect, it } from "vitest";
import { connectStep } from "@/app/(dashboard)/whatsapp/automatizaciones/_graph-edit";
import { isBranching } from "../types";
import { buttons, graph, text } from "./helpers";

describe("conexiones del mapa", () => {
  it("reordena una secuencia sin cambiar el borrador original", () => {
    const original = graph([text("a", "A"), text("b", "B"), text("c", "C")]);
    const result = connectStep(original, "c", "a");
    expect(result.error).toBeUndefined();
    expect(result.graph.steps.map((step) => step.id)).toEqual(["b", "c", "a"]);
    expect(original.steps.map((step) => step.id)).toEqual(["a", "b", "c"]);
  });

  it("mueve un paso a una rama conservando las otras ramas", () => {
    const choice = buttons("choice", ["Sí", "No"], { "Sí": [text("existing", "Anterior")] });
    const original = graph([text("moving", "Mover"), choice]);
    const branchId = isBranching(choice) ? choice.branches[0].id : "";
    const result = connectStep(original, "choice", "moving", branchId);
    expect(result.error).toBeUndefined();
    expect(result.graph.steps.map((step) => step.id)).toEqual(["choice"]);
    const movedChoice = result.graph.steps[0];
    if (!isBranching(movedChoice)) throw new Error("Se perdió la rama");
    expect(movedChoice.branches[0].steps.map((step) => step.id)).toEqual(["moving", "existing"]);
    expect(movedChoice.branches[1].steps).toEqual([]);
  });

  it("bloquea ciclos, salidas incorrectas y pasos terminales antes de otros", () => {
    const choice = buttons("choice", ["Sí"], { "Sí": [text("child", "Hijo")] });
    const original = graph([text("first", "Primero"), choice]);
    expect(connectStep(original, "child", "choice").error).toMatch(/descendientes/);
    expect(connectStep(original, "choice", "first").error).toMatch(/salida válida/);
    expect(connectStep(original, "trigger", "choice").error).toMatch(/final/);
    expect(connectStep(original, "choice", "first", "no-existe").error).toMatch(/salida válida/);
    expect(connectStep(original, "first", "first").error).toMatch(/consigo mismo/);
    expect(original.steps.map((step) => step.id)).toEqual(["first", "choice"]);
  });

  it("rechaza conexiones hacia marcadores vacíos", () => {
    const original = graph([text("a", "A")]);
    expect(connectStep(original, "a", "empty:root").error).toMatch(/pasos existentes/);
  });
});
