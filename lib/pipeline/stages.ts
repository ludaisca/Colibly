import type { LeadStatus } from "@prisma/client";

export const PIPELINE_STAGES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "CUSTOMER",
  "LOST",
];

export const STAGE_LABEL: Record<LeadStatus, string> = {
  NEW: "Nuevos",
  CONTACTED: "Contactados",
  QUALIFIED: "Calificados",
  CUSTOMER: "Clientes",
  LOST: "Perdidos",
};

export type StageOutcome = "OPEN" | "WON" | "LOST";

export const DEFAULT_PIPELINE_NAME = "Ventas";

export const DEFAULT_PIPELINE_STAGES: { name: string; position: number; outcome: StageOutcome; leadStatus: LeadStatus }[] = [
  { name: "Nuevos", position: 0, outcome: "OPEN", leadStatus: "NEW" },
  { name: "Contactados", position: 1, outcome: "OPEN", leadStatus: "CONTACTED" },
  { name: "Calificados", position: 2, outcome: "OPEN", leadStatus: "QUALIFIED" },
  { name: "Clientes", position: 3, outcome: "WON", leadStatus: "CUSTOMER" },
  { name: "Perdidos", position: 4, outcome: "LOST", leadStatus: "LOST" },
];

// Estado CRM que corresponde a una columna. Las del embudo por defecto
// conservan su LeadStatus; las demás usan ganado / perdido / abierto.
export function leadStatusForStage(
  stage: { outcome: StageOutcome; leadStatus: LeadStatus | null },
  current: LeadStatus
): LeadStatus {
  if (stage.leadStatus) return stage.leadStatus;
  if (stage.outcome === "WON") return "CUSTOMER";
  if (stage.outcome === "LOST") return "LOST";
  if (current === "CUSTOMER" || current === "LOST") return "QUALIFIED";
  return current;
}


// ── Marca de estación (Andén, 2026-11-07) ────────────────────────────────────
// El estado de un lead es una estación de la ruta de la venta, no una alerta:
// sin ámbar ni rojo (son las lámparas de espera/SLA). Etapas abiertas en
// neutro con los puntos que llevan recorridos; solo "Cliente"/ganada lleva
// color (éxito); "Perdido" va aparte, apagado y sin puntos.

export type StationTone = "open" | "won" | "lost";
export interface Station {
  /** Puntos llenos (1…total); 0 para perdido. */
  step: number;
  total: number;
  tone: StationTone;
}

const LEAD_STEP: Record<LeadStatus, number> = { NEW: 1, CONTACTED: 2, QUALIFIED: 3, CUSTOMER: 4, LOST: 0 };

export function leadStation(status: LeadStatus): Station {
  if (status === "LOST") return { step: 0, total: 4, tone: "lost" };
  return { step: LEAD_STEP[status], total: 4, tone: status === "CUSTOMER" ? "won" : "open" };
}

/** Estación de una columna de embudo (también embudos con etapas propias). */
export function stageStation(outcome: StageOutcome, openIndex: number, openCount: number): Station {
  const total = Math.max(1, openCount) + 1;
  if (outcome === "WON") return { step: total, total, tone: "won" };
  if (outcome === "LOST") return { step: 0, total, tone: "lost" };
  return { step: Math.min(openIndex + 1, total - 1), total, tone: "open" };
}
