"use client";

import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";

// Adaptador (rediseño con Astryx): RadioList de Astryx. `name` sirve también
// como nombre del grupo para lectores de pantalla (la etiqueta visible la pone
// cada pantalla arriba del grupo).
interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  name: string;
  disabled?: boolean;
  className?: string;
  error?: string;
}

export function RadioGroup({ options, value, onChange, name, disabled, className, error }: RadioGroupProps) {
  return (
    <RadioList
      label={name}
      isLabelHidden
      htmlName={name}
      value={value ?? ""}
      onChange={(next) => onChange?.(next)}
      isDisabled={disabled}
      status={error ? { type: "error", message: error } : undefined}
      containerClassName={className}
    >
      {options.map((opt) => (
        <RadioListItem key={opt.value} value={opt.value} label={opt.label} description={opt.description} />
      ))}
    </RadioList>
  );
}
