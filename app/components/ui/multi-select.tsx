"use client";

import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { markFormFieldControl, useFormFieldContext } from "./form-field-context";

// Adaptador (rediseño con Astryx): MultiSelector de Astryx con búsqueda. API
// de siempre (`options`, `value`, `onChange` con los `value` como strings).
// Dentro de <FormField> toma etiqueta, error y ayuda.

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const MultiSelect = markFormFieldControl(function MultiSelect({
  options,
  value = [],
  onChange,
  placeholder = "Seleccionar…",
  error: errorProp,
  disabled,
  id,
  className,
}: MultiSelectProps) {
  const field = useFormFieldContext();
  const direct = field?.direct === true;
  const error = errorProp ?? (direct ? field?.error : undefined);
  return (
    <MultiSelector
      id={id}
      label={field?.label ?? placeholder}
      isLabelHidden={!direct}
      aria-labelledby={field && !direct ? field.labelId : undefined}
      description={direct ? field?.hint : undefined}
      isRequired={direct ? field?.required : undefined}
      options={options}
      value={value}
      onChange={(next) => onChange?.(next)}
      placeholder={placeholder}
      hasSearch={options.length > 8}
      searchPlaceholder="Buscar…"
      isDisabled={disabled}
      status={error ? { type: "error", message: error } : undefined}
      width="100%"
      containerClassName={className}
    />
  );
});
