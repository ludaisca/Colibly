"use client";

import React from "react";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { textOf } from "./text-of";

// Adaptador (rediseño con Astryx): misma API de siempre, dibujado por el
// CheckboxInput de Astryx. Sin `label` visible, `ariaLabel` da el nombre.

interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  ariaLabel?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  error?: string;
}

export function Checkbox({ checked = false, onChange, label, ariaLabel, description, disabled, id, className, error }: CheckboxProps) {
  const text = textOf(label);
  return (
    <CheckboxInput
      id={id}
      label={text ?? ariaLabel ?? "Seleccionar"}
      isLabelHidden={!text}
      description={description}
      value={checked}
      onChange={(next) => onChange?.(next)}
      isDisabled={disabled}
      status={error ? { type: "error", message: error } : undefined}
      className={className}
    />
  );
}
