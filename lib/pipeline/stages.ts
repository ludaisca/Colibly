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
  QUALIFIED: "border-accent/30",
  CUSTOMER: "border-success-border",
  LOST: "border-muted/30",
};

export const STAGE_COLOR_BG: Record<LeadStatus, string> = {
  NEW: "bg-info-bg/40",
  CONTACTED: "bg-warning-bg/40",
  QUALIFIED: "bg-accent/5",
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
