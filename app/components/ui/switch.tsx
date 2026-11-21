"use client";

import { Switch as AxSwitch } from "@astryxdesign/core/Switch";

// Adaptador (rediseño con Astryx): misma API de siempre, dibujado por el
// Switch de Astryx. La etiqueta sigue siendo solo para lectores de pantalla.

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Nombre accesible (obligatorio: el interruptor no tiene texto propio). */
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onCheckedChange, label, disabled, className }: SwitchProps) {
  return (
    <AxSwitch
      label={label}
      isLabelHidden
      value={checked}
      onChange={(next) => onCheckedChange(next)}
      isDisabled={disabled}
      className={className}
    />
  );
}
