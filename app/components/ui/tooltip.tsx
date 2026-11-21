"use client";

import type { ReactElement } from "react";
import { Tooltip as AxTooltip } from "@astryxdesign/core/Tooltip";

// Adaptador (rediseño con Astryx): misma API de siempre, dibujado por el
// Tooltip de Astryx (aparece con teclado y no se sale de la pantalla).
// Reglas de siempre: es ayuda visual, el botón de solo icono conserva su
// `aria-label`; nada importante vive solo aquí (en táctil no hay hover).

interface TooltipProps {
  label: string;
  children: ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom" | "left" | "right";
}

const PLACEMENT = { top: "above", bottom: "below", left: "start", right: "end" } as const;

export function Tooltip({ label, children, side = "top" }: TooltipProps) {
  return (
    <AxTooltip content={label} placement={PLACEMENT[side]} delay={350} hasHoverIndication={false}>
      {children}
    </AxTooltip>
  );
}
