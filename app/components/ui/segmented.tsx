"use client";

import type React from "react";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Icon as AxIcon, type IconType } from "@astryxdesign/core/Icon";
import { textOf } from "./text-of";

// Adaptador (rediseño con Astryx): SegmentedControl de Astryx. Para cambiar
// de vista o filtro dentro de una pantalla; si cada opción es una sección con
// su propio contenido, usa `Tabs`.

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
    <div className={className}>
      <SegmentedControl
        label={label}
        value={value}
        onChange={(next) => { if (next !== value) onChange(next as T); }}
        isDisabled={disabled}
        size="sm"
      >
        {options.map((option) => (
          <SegmentedControlItem
            key={option.value}
            value={option.value}
            label={textOf(option.label) ?? option.value}
            icon={option.icon ? <AxIcon icon={option.icon as IconType} /> : undefined}
          />
        ))}
      </SegmentedControl>
    </div>
  );
}
