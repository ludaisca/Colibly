import { describe, expect, it } from "vitest";
import { leadStatusForStage } from "../stages";

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
