import { describe, expect, it } from "vitest";
import { summarizeStages } from "../board-rules";

const stages = [
  { id: "nuevo", leadStatus: "NEW" as const },
  { id: "contactado", leadStatus: "CONTACTED" as const },
  { id: "propia", leadStatus: null },
];

describe("summarizeStages", () => {
  it("suma por etapa y separa lo real de los ejemplos", () => {
    const out = summarizeStages(
      [
        { pipelineStageId: "nuevo", leadStatus: "NEW", isSample: false, count: 1200, valueCents: 0 },
        { pipelineStageId: "nuevo", leadStatus: "NEW", isSample: true, count: 5, valueCents: 50000 },
        { pipelineStageId: "propia", leadStatus: "CONTACTED", isSample: false, count: 3, valueCents: 900 },
      ],
      stages,
      true
    );
    expect(out.nuevo).toEqual({ count: 1205, valueCents: 50000, realCount: 1200, realValueCents: 0 });
    expect(out.propia.realCount).toBe(3);
    expect(out.contactado.count).toBe(0);
  });

  it("sin etapa: en el embudo principal cae en la de su estado; en otro embudo no cuenta", () => {
    const rows = [{ pipelineStageId: null, leadStatus: "CONTACTED" as const, isSample: false, count: 7, valueCents: 100 }];
    expect(summarizeStages(rows, stages, true).contactado.realCount).toBe(7);
    expect(summarizeStages(rows, stages, false).contactado.realCount).toBe(0);
  });

  it("filas de etapas ajenas se ignoran", () => {
    const out = summarizeStages([{ pipelineStageId: "otra", leadStatus: "NEW", isSample: false, count: 9, valueCents: 0 }], stages, true);
    expect(Object.values(out).every((s) => s.count === 0)).toBe(true);
  });
});
