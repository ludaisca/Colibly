"use client";

import { Selector } from "@astryxdesign/core/Selector";
import { markFormFieldControl, useFormFieldContext } from "./form-field-context";

// Adaptador (rediseño con Astryx): Selector de Astryx con búsqueda dentro del
// menú. API de siempre. Dentro de <FormField> toma etiqueta, error y ayuda.

export interface SearchableSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  error?: string;
  showErrorMessage?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const SearchableSelect = markFormFieldControl(function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  error: errorProp,
  showErrorMessage = false,
  disabled,
  id,
  className,
}: SearchableSelectProps) {
  const field = useFormFieldContext();
  const direct = field?.direct === true;
  const error = errorProp ?? (direct ? field?.error : undefined);
  return (
    <Selector
      id={id}
      label={field?.label ?? placeholder}
      isLabelHidden={!direct}
      aria-labelledby={field && !direct ? field.labelId : undefined}
      description={direct ? field?.hint : undefined}
      isRequired={direct ? field?.required : undefined}
      options={options}
      value={value === "" ? undefined : value}
      onChange={(next) => onChange(next ?? "")}
      placeholder={placeholder}
      hasSearch
      searchPlaceholder={searchPlaceholder}
      emptySearchText="Sin resultados"
      isDisabled={disabled}
      status={error ? { type: "error", message: direct || showErrorMessage ? error : undefined } : undefined}
      width="100%"
      containerClassName={className}
    />
  );
});
