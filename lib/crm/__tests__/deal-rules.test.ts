import { describe, expect, it } from "vitest";
import {
  defaultDealTitle,
  effectiveProbability,
  isSupportedCurrency,
  planTransition,
  roundMoney,
  stageProbability,
  validateStageSet,
  weightedAmount,
  type StageLite,
} from "@/lib/crm/deal-rules";
import { CrmError } from "@/lib/crm/errors";

const open1: StageLite = { id: "s1", name: "Nuevo", outcome: "OPEN", probability: 10 };
const open2: StageLite = { id: "s2", name: "Calificado", outcome: "OPEN", probability: 50 };
const won: StageLite = { id: "s3", name: "Ganado", outcome: "WON", probability: 100 };
const lost: StageLite = { id: "s4", name: "Perdido", outcome: "LOST", probability: 0 };
const NOW = new Date("2026-10-06T12:00:00Z");
const deal = (stage: StageLite, minutesAgo = 90) => ({
  stageId: stage.id,
  status: stage.outcome,
  stageEnteredAt: new Date(NOW.getTime() - minutesAgo * 60_000),
});

describe("planTransition", () => {
  it("no hace nada si ya está en la etapa", () => {
    expect(planTransition(deal(open1), open1, NOW).changed).toBe(false);
  });

  it("abierto → abierto: sigue abierto, sin cierre, con el tiempo en la etapa anterior", () => {
    const p = planTransition(deal(open1, 90), open2, NOW);
    expect(p).toMatchObject({ changed: true, status: "OPEN", closedAt: null, lostReasonId: null, secondsInFrom: 5400 });
  });

  it("perder exige motivo", () => {
    expect(() => planTransition(deal(open2), lost, NOW)).toThrow(CrmError);
    expect(() => planTransition(deal(open2), lost, NOW, { lostReasonId: "  " })).toThrow("motivo de pérdida");
  });

  it("perder con motivo cierra el negocio y guarda la nota recortada", () => {
    const p = planTransition(deal(open2), lost, NOW, { lostReasonId: "lr1", lossNote: "  muy caro  " });
    expect(p).toMatchObject({ status: "LOST", closedAt: NOW, lostReasonId: "lr1", lossNote: "muy caro" });
    expect(planTransition(deal(open2), lost, NOW, { lostReasonId: "lr1", lossNote: "x".repeat(900) }).lossNote).toHaveLength(500);
  });

  it("ganar cierra sin motivo aunque se mande uno", () => {
    const p = planTransition(deal(open2), won, NOW, { lostReasonId: "lr1", lossNote: "x" });
    expect(p).toMatchObject({ status: "WON", closedAt: NOW, lostReasonId: null, lossNote: null });
  });

  it("reabrir un perdido limpia cierre y motivo", () => {
    const p = planTransition(deal(lost), open1, NOW);
    expect(p).toMatchObject({ changed: true, status: "OPEN", closedAt: null, lostReasonId: null });
  });

  it("de ganado a perdido también exige motivo", () => {
    expect(() => planTransition(deal(won), lost, NOW)).toThrow();
  });

  it("un reloj adelantado no da segundos negativos", () => {
    const future = { stageId: "s1", status: "OPEN" as const, stageEnteredAt: new Date(NOW.getTime() + 60_000) };
    expect(planTransition(future, open2, NOW).secondsInFrom).toBe(0);
  });
});

describe("probabilidad y pronóstico", () => {
  it("ganado 100, perdido 0, abierto usa la suya o la de la etapa", () => {
    expect(effectiveProbability({ status: "WON", probability: 20 }, open1)).toBe(100);
    expect(effectiveProbability({ status: "LOST", probability: 90 }, open1)).toBe(0);
    expect(effectiveProbability({ status: "OPEN", probability: null }, open2)).toBe(50);
    expect(effectiveProbability({ status: "OPEN", probability: 75 }, open2)).toBe(75);
    expect(effectiveProbability({ status: "OPEN", probability: 0 }, open2)).toBe(0);
  });

  it("acota la probabilidad a 0–100", () => {
    expect(effectiveProbability({ status: "OPEN", probability: 250 }, open1)).toBe(100);
    expect(effectiveProbability({ status: "OPEN", probability: -5 }, open1)).toBe(0);
  });

  it("monto ponderado a centavos", () => {
    expect(weightedAmount(1000, 25)).toBe(250);
    expect(weightedAmount(333.33, 50)).toBe(166.67);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});

describe("validateStageSet", () => {
  const ok = [
    { name: "Nuevo", outcome: "OPEN" as const, probability: 10 },
    { name: "Ganado", outcome: "WON" as const, probability: 100 },
    { name: "Perdido", outcome: "LOST" as const, probability: 0 },
  ];

  it("acepta un juego válido", () => expect(validateStageSet(ok)).toBeNull());
  it("exige etapas", () => expect(validateStageSet([])).toMatch(/al menos una/));
  it("la primera debe estar abierta", () => expect(validateStageSet([ok[1], ok[0], ok[2]])).toMatch(/primera etapa/));
  it("exige ganado y perdido", () => {
    expect(validateStageSet([ok[0], ok[2]])).toMatch(/ganado/);
    expect(validateStageSet([ok[0], ok[1]])).toMatch(/perdido/);
  });
  it("no repite nombres (sin importar mayúsculas ni espacios)", () => {
    expect(validateStageSet([ok[0], { ...ok[0], name: " nuevo " }, ok[1], ok[2]])).toMatch(/dos etapas/);
  });
  it("exige nombre", () => expect(validateStageSet([{ ...ok[0], name: "  " }, ok[1], ok[2]])).toMatch(/nombre/));
});

describe("varios", () => {
  it("probabilidad de etapa cerrada fija", () => {
    expect(stageProbability("WON", 10)).toBe(100);
    expect(stageProbability("LOST", 80)).toBe(0);
    expect(stageProbability("OPEN", 130)).toBe(100);
    expect(stageProbability("OPEN", undefined)).toBe(0);
  });
  it("título por defecto", () => {
    expect(defaultDealTitle("  Ana Pérez ")).toBe("Ana Pérez");
    expect(defaultDealTitle("   ")).toBe("Negocio nuevo");
  });
  it("monedas", () => {
    expect(isSupportedCurrency("MXN")).toBe(true);
    expect(isSupportedCurrency("XXX")).toBe(false);
  });
});
