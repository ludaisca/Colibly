import { ProgressBar } from "@astryxdesign/core/ProgressBar";

// Adaptador (rediseño con Astryx): ProgressBar de Astryx.
interface ProgressProps {
  value: number;
  label?: string;
  tone?: "accent" | "warning" | "danger";
  className?: string;
}

const VARIANT = { accent: "accent", warning: "warning", danger: "error" } as const;

export function Progress({ value, label, tone = "accent", className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={className}>
      <ProgressBar
        label={label ?? "Progreso"}
        isLabelHidden={!label}
        hasValueLabel={!!label}
        value={clamped}
        variant={VARIANT[tone]}
      />
    </div>
  );
}
