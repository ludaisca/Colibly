"use client";

import React from "react";
import { Badge as AxBadge } from "@astryxdesign/core/Badge";
import { Icon as AxIcon, type IconType } from "@astryxdesign/core/Icon";

// Adaptador (rediseño con Astryx): misma API de siempre, dibujado por el Badge
// de Astryx. `accent` usa la variante teal (Astryx no tiene "accent").

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
type Size = "sm" | "md";

const AX_VARIANT = {
  neutral: "neutral",
  success: "success",
  warning: "warning",
  danger: "error",
  info: "info",
  accent: "teal",
} as const;

interface BadgeProps {
  tone?: Tone;
  /** Astryx tiene un solo tamaño de badge; se conserva por compatibilidad. */
  size?: Size;
  icon?: React.ElementType;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ tone = "neutral", icon, className, children }: BadgeProps) {
  return (
    <AxBadge
      variant={AX_VARIANT[tone]}
      label={children}
      icon={icon ? <AxIcon icon={icon as IconType} /> : undefined}
      className={className}
    />
  );
}
