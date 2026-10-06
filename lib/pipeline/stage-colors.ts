// Tonos de etapa (`PipelineStage.color`) → clases de los tokens semánticos. Las
// clases van completas (no interpoladas) para que Tailwind las detecte.
export type StageTone = "info" | "warning" | "accent" | "success" | "danger" | "muted";

const TONES: Record<StageTone, { border: string; bg: string; dot: string }> = {
  info: { border: "border-info-border", bg: "bg-info-bg/40", dot: "bg-info" },
  warning: { border: "border-warning-border", bg: "bg-warning-bg/40", dot: "bg-warning" },
  accent: { border: "border-accent-muted", bg: "bg-accent-subtle", dot: "bg-accent" },
  success: { border: "border-success-border", bg: "bg-success-bg/40", dot: "bg-success" },
  danger: { border: "border-danger-border", bg: "bg-danger-bg/40", dot: "bg-danger" },
  muted: { border: "border-muted/30", bg: "bg-surface-light", dot: "bg-muted" },
};

export function stageClasses(color: string) {
  return TONES[(color in TONES ? color : "info") as StageTone];
}
