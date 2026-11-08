"use client";

import type React from "react";
import { cn } from "./cn";

// Interruptor de opciones excluyentes (2026-11-07, auditoría): botones con
// `aria-pressed` dentro de un grupo con nombre. Andén: la opción activa en
// tinta (regla de la tinta), no en el acento. Para cambiar de vista o de
// filtro dentro de una misma pantalla; si cada opción es una sección con su
// propio contenido, usa `Tabs`.

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: React.ReactNode; icon?: React.ElementType }[];
  disabled?: boolean;
  className?: string;
}

export function Segmented<T extends string>({ label, value, onChange, options, disabled, className }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex gap-0.5 rounded-full bg-surface-light p-0.5", className)}>
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => {
        const active = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => { if (!active) onChange(optionValue); }}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors motion-reduce:transition-none disabled:opacity-50",
              active ? "bg-foreground text-background" : "text-muted hover:text-foreground"
            )}
          >
            {Icon && <Icon size={14} aria-hidden className="shrink-0" />}
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}
