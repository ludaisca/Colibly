import React from "react";
import { cn } from "./cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
type Size = "sm" | "md";

// Sin borde, radio 4, text-xs 500: fondo tenue + texto (dirección congelada).
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-light text-muted",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger:  "bg-danger-bg text-danger",
  info:    "bg-info-bg text-info",
  accent:  "bg-accent-subtle text-accent-ink",
};

const SIZE: Record<Size, string> = {
  sm: "px-1.5 py-px text-xs gap-1",
  md: "px-2 py-0.5 text-xs gap-1.5",
};

interface BadgeProps {
  tone?: Tone;
  size?: Size;
  icon?: React.ElementType;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ tone = "neutral", size = "md", icon: Icon, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs font-medium",
        TONE[tone],
        SIZE[size],
        className
      )}
    >
      {Icon && <Icon size={12} className="shrink-0" />}
      {children}
    </span>
  );
}
