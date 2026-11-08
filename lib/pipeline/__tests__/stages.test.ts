import { describe, expect, it } from "vitest";
import { leadStatusForStage, leadStation, stageStation } from "../stages";

describe("leadStatusForStage", () => {
  it("la columna del embudo por defecto conserva su estado", () => {
    expect(leadStatusForStage({ outcome: "WON", leadStatus: "CUSTOMER" }, "NEW")).toBe("CUSTOMER");
  });
  it("una columna ganada sin estado CRM marca cliente", () => {
    expect(leadStatusForStage({ outcome: "WON", leadStatus: null }, "CONTACTED")).toBe("CUSTOMER");
  });
  it("una columna perdida marca perdido", () => {
    expect(leadStatusForStage({ outcome: "LOST", leadStatus: null }, "QUALIFIED")).toBe("LOST");
  });
  it("reabrir desde cliente deja el lead calificado", () => {
    expect(leadStatusForStage({ outcome: "OPEN", leadStatus: null }, "CUSTOMER")).toBe("QUALIFIED");
    expect(leadStatusForStage({ outcome: "OPEN", leadStatus: null }, "NEW")).toBe("NEW");
  });
});

describe("estaciones", () => {
  it("estado del lead", () => {
    expect(leadStation("NEW")).toEqual({ step: 1, total: 4, tone: "open" });
    expect(leadStation("QUALIFIED")).toEqual({ step: 3, total: 4, tone: "open" });
    expect(leadStation("CUSTOMER")).toEqual({ step: 4, total: 4, tone: "won" });
    expect(leadStation("LOST")).toEqual({ step: 0, total: 4, tone: "lost" });
  });
  it("columna de un embudo con etapas propias", () => {
    expect(stageStation("OPEN", 0, 5)).toEqual({ step: 1, total: 6, tone: "open" });
    expect(stageStation("OPEN", 4, 5)).toEqual({ step: 5, total: 6, tone: "open" });
    expect(stageStation("WON", 5, 5)).toEqual({ step: 6, total: 6, tone: "won" });
    expect(stageStation("LOST", 6, 5).tone).toBe("lost");
  });
});
