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

export const STAGE_COLOR_BORDER: Record<LeadStatus, string> = {
  NEW: "border-info-border",
  CONTACTED: "border-warning-border",
  QUALIFIED: "border-accent-muted",
  CUSTOMER: "border-success-border",
  LOST: "border-muted/30",
};

export const STAGE_COLOR_BG: Record<LeadStatus, string> = {
  NEW: "bg-info-bg/40",
  CONTACTED: "bg-warning-bg/40",
  QUALIFIED: "bg-accent-subtle",
  CUSTOMER: "bg-success-bg/40",
  LOST: "bg-surface-light",
};

export const STAGE_DOT_COLOR: Record<LeadStatus, string> = {
  NEW: "bg-info",
  CONTACTED: "bg-warning",
  QUALIFIED: "bg-accent",
  CUSTOMER: "bg-success",
  LOST: "bg-muted",
};

export function scoreLabelToStage(label: string): LeadStatus | null {
  const map: Record<string, LeadStatus> = {
    frio: "NEW",
    tibio: "CONTACTED",
    caliente: "QUALIFIED",
  };
  return map[label.toLowerCase()] ?? null;
}

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

export function stageChrome(outcome: StageOutcome, index: number): { border: string; bg: string; dot: string } {
  if (outcome === "WON") return { border: "border-success-border", bg: "bg-success-bg/40", dot: "bg-success" };
  if (outcome === "LOST") return { border: "border-muted/30", bg: "bg-surface-light", dot: "bg-muted" };
  const open = [
    { border: "border-info-border", bg: "bg-info-bg/40", dot: "bg-info" },
    { border: "border-warning-border", bg: "bg-warning-bg/40", dot: "bg-warning" },
    { border: "border-accent-muted", bg: "bg-accent-subtle", dot: "bg-accent" },
  ];
  return open[index % open.length];
}

