import { cn } from "./cn";

interface ProgressProps {
  value: number;
  label?: string;
  /** Texto legible del valor para lectores de pantalla (p. ej. "3 de 5 pasos"). */
  valueText?: string;
  tone?: "accent" | "warning" | "danger";
  className?: string;
}

const BAR: Record<NonNullable<ProgressProps["tone"]>, string> = {
  accent: "bg-accent",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function Progress({ value, label, valueText, tone = "accent", className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full space-y-1", className)}>
      {label && (
        <div className="flex justify-between text-xs text-muted-darker">
          <span>{label}</span>
          <span>{clamped}%</span>
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-light"
        role="progressbar"
        aria-label={label ?? "Progreso"}
        aria-valuenow={clamped}
        aria-valuetext={valueText}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-300 ease-out", BAR[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
