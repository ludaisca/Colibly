"use client";

import { Loader2 } from "lucide-react";
import { Spinner as AxSpinner } from "@astryxdesign/core/Spinner";
import { cn } from "./cn";

// Adaptador (rediseño con Astryx): misma API de siempre, dibujado por el
// Spinner de Astryx. Tamaños de Colibly 14/18/24 px → anillos de 14/18/28.

type Size = "sm" | "md" | "lg";

const AX_SIZE = { sm: "md", md: "lg", lg: "xl" } as const;

interface SpinnerProps {
  size?: Size;
  label?: string;
  className?: string;
}

export function Spinner({ size = "md", label = "Cargando…", className }: SpinnerProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <AxSpinner size={AX_SIZE[size]} shade="subtle" aria-label={label || "Cargando…"} />
    </span>
  );
}

/** Ícono giratorio para la prop `icon` de `Button`/`DropdownItem` mientras una acción corre. */
export function SpinningLoader({ size, className, ...rest }: { size?: number; className?: string; "aria-hidden"?: boolean }) {
  return <Loader2 size={size} className={cn("animate-spin motion-reduce:animate-none", className)} {...rest} />;
}
