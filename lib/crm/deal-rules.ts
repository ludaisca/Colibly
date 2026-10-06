import type { DealStatus } from "@prisma/client";
import { invalid } from "@/lib/crm/errors";

// Reglas PURAS de negocios y pipelines (sin base de datos), para poder probarlas.
// Los servicios (`deals.ts`, `pipelines.ts`) las aplican con lo que leen de la base.

export interface StageLite {
  id: string;
  name: string;
  outcome: DealStatus;
  probability: number;
}

export interface DealLite {
  stageId: string;
  status: DealStatus;
  stageEnteredAt: Date;
}

export interface TransitionInput {
  lostReasonId?: string | null;
  lossNote?: string | null;
}

export interface TransitionPlan {
  // false = ya estaba en esa etapa: no hay nada que escribir ni disparar.
  changed: boolean;
  status: DealStatus;
  closedAt: Date | null;
  lostReasonId: string | null;
  lossNote: string | null;
  // Segundos que estuvo en la etapa de la que sale.
  secondsInFrom: number;
}

// Qué pasa cuando un negocio entra a `to`: estado resultante, fecha de cierre y
// motivo de pérdida. Perder exige motivo; ganar o reabrir lo limpia (el motivo
// anterior queda en el historial de etapas/actividad, no en el negocio).
export function planTransition(deal: DealLite, to: StageLite, now: Date, input: TransitionInput = {}): TransitionPlan {
  const secondsInFrom = Math.max(0, Math.floor((now.getTime() - deal.stageEnteredAt.getTime()) / 1000));
  if (deal.stageId === to.id) {
    return { changed: false, status: deal.status, closedAt: null, lostReasonId: null, lossNote: null, secondsInFrom };
  }
  if (to.outcome === "LOST") {
    const lostReasonId = input.lostReasonId?.trim();
    if (!lostReasonId) throw invalid("Indica el motivo de pérdida");
    const note = input.lossNote?.trim().slice(0, 500) || null;
    return { changed: true, status: "LOST", closedAt: now, lostReasonId, lossNote: note, secondsInFrom };
  }
  return {
    changed: true,
    status: to.outcome,
    closedAt: to.outcome === "OPEN" ? null : now,
    lostReasonId: null,
    lossNote: null,
    secondsInFrom,
  };
}

// Probabilidad con la que cuenta el negocio en el pronóstico: ganado = 100,
// perdido = 0; abierto, la suya si la fijó y si no la de su etapa.
export function effectiveProbability(deal: { status: DealStatus; probability: number | null }, stage: { probability: number }): number {
  if (deal.status === "WON") return 100;
  if (deal.status === "LOST") return 0;
  return clampPercent(deal.probability ?? stage.probability);
}

export function weightedAmount(amount: number, probability: number): number {
  return roundMoney((amount * clampPercent(probability)) / 100);
}

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

// Título por defecto de un negocio nuevo.
export function defaultDealTitle(personName: string): string {
  const name = personName.trim();
  return name ? name.slice(0, 200) : "Negocio nuevo";
}

// ── Etapas de un pipeline ───────────────────────────────────────────────────

export interface StageDraft {
  name: string;
  outcome: DealStatus;
  probability: number;
}

// Un pipeline necesita poder abrir negocios (primera etapa abierta) y poder
// cerrarlos (al menos una etapa de ganado y una de perdido); los nombres no se
// repiten dentro del pipeline. Devuelve el mensaje del primer problema o null.
export function validateStageSet(stages: ReadonlyArray<StageDraft>): string | null {
  if (!stages.length) return "El pipeline necesita al menos una etapa";
  if (stages[0].outcome !== "OPEN") return "La primera etapa debe ser una etapa abierta (por ahí entran los negocios nuevos)";
  if (!stages.some((s) => s.outcome === "WON")) return "El pipeline necesita una etapa de negocio ganado";
  if (!stages.some((s) => s.outcome === "LOST")) return "El pipeline necesita una etapa de negocio perdido";
  const seen = new Set<string>();
  for (const s of stages) {
    const key = s.name.trim().toLowerCase();
    if (!key) return "Cada etapa necesita un nombre";
    if (seen.has(key)) return `Hay dos etapas llamadas "${s.name.trim()}"`;
    seen.add(key);
  }
  return null;
}

// La probabilidad de una etapa cerrada no se elige: ganado 100, perdido 0.
export function stageProbability(outcome: DealStatus, requested: number | null | undefined): number {
  if (outcome === "WON") return 100;
  if (outcome === "LOST") return 0;
  return clampPercent(requested ?? 0);
}

// ── Monedas ─────────────────────────────────────────────────────────────────

export const CURRENCIES = ["MXN", "USD", "EUR", "COP", "ARS", "CLP", "PEN", "BRL", "UYU", "GTQ", "CRC", "DOP", "BOB", "PYG", "GBP", "CAD"] as const;

export function isSupportedCurrency(code: string): boolean {
  return (CURRENCIES as readonly string[]).includes(code);
}
