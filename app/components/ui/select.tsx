"use client";

import React, { Children, isValidElement, useState, type ReactNode } from "react";
import { Selector } from "@astryxdesign/core/Selector";
import { markFormFieldControl, useExternalLabel, useFormFieldContext } from "./form-field-context";
import { textOf } from "./text-of";

// Adaptador (rediseño con Astryx): misma API de siempre (<option> como hijos,
// onChange con un evento cuyo `target.value` es el valor elegido), dibujado por
// el Selector de Astryx. Dentro de <FormField> toma etiqueta/error/ayuda.

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  showErrorMessage?: boolean;
  placeholder?: string;
  /** Versión compacta para tarjetas y filas densas. */
  compact?: boolean;
}

type Option = { value: string; label: string; disabled?: boolean };

/** Convierte los <option> hijos (también los generados con .map) en opciones. */
function optionsOf(children: ReactNode): Option[] {
  const out: Option[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return;
    if (child.type === React.Fragment) {
      out.push(...optionsOf(child.props.children));
      return;
    }
    if (child.type !== "option") return;
    const label = textOf(child.props.children) ?? "";
    out.push({ value: String(child.props.value ?? label), label, disabled: child.props.disabled });
  });
  return out;
}

/** Evento mínimo: el código existente solo lee `e.target.value`. */
function selectEvent(value: string, name?: string, id?: string) {
  const target = { value, name: name ?? "", id: id ?? "" };
  return { target, currentTarget: target } as unknown as React.ChangeEvent<HTMLSelectElement>;
}

export const Select = markFormFieldControl(
  React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
    {
      error: errorProp,
      showErrorMessage = false,
      placeholder,
      compact = false,
      className,
      children,
      value,
      defaultValue,
      onChange,
      id,
      name,
      disabled,
      required,
      "aria-label": ariaLabel,
      "aria-describedby": ariaDescribedBy,
    },
    _ref
  ) {
    const field = useFormFieldContext();
    const external = useExternalLabel(id, !field && !ariaLabel);
    const [inner, setInner] = useState(String(defaultValue ?? ""));
    const current = value === undefined ? inner : String(value ?? "");
    const options = optionsOf(children);

    const direct = field?.direct === true;
    const error = errorProp ?? (direct ? field?.error : undefined);
    const showMessage = direct || showErrorMessage;

    return (
      <Selector
        id={id}
        label={field?.label ?? ariaLabel ?? external ?? placeholder ?? name ?? "Opción"}
        isLabelHidden={!direct}
        aria-labelledby={field && !direct ? field.labelId : undefined}
        aria-describedby={direct ? undefined : ariaDescribedBy}
        description={direct ? field?.hint : undefined}
        isRequired={direct ? field?.required : required}
        isDisabled={disabled}
        htmlName={name}
        placeholder={placeholder ?? "Elige una opción"}
        size={compact ? "sm" : "md"}
        status={error ? { type: "error", message: showMessage ? error : undefined } : undefined}
        width="100%"
        containerClassName={className}
        options={options}
        // "" es "sin elegir": muestra el placeholder.
        value={current === "" && !options.some((o) => o.value === "") ? undefined : current}
        onChange={(v) => {
          const next = v ?? "";
          if (value === undefined) setInner(next);
          onChange?.(selectEvent(next, name, id));
        }}
      />
    );
  })
);
