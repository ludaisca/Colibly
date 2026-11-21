"use client";

import React, { useState } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import type { IconType } from "@astryxdesign/core/Icon";
import { markFormFieldControl, useFormFieldContext } from "./form-field-context";

// Adaptador (rediseño con Astryx): misma API de siempre (onChange recibe el
// evento nativo, value/defaultValue, ref al <input>), dibujado por el
// TextInput/NumberInput de Astryx. Dentro de <FormField> toma de ahí la
// etiqueta, el error y la ayuda (una sola etiqueta).

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ElementType;
  error?: string;
  showErrorMessage?: boolean;
  inputClassName?: string;
}

const TEXT_TYPES = new Set(["text", "password", "email", "search", "tel", "url"]);
type TextType = "text" | "password" | "email" | "search" | "tel" | "url";

/** Evento mínimo para el NumberInput, que entrega un número y no un evento. */
function numberEvent(value: string, name?: string, id?: string) {
  const target = { value, valueAsNumber: value === "" ? NaN : Number(value), name: name ?? "", id: id ?? "" };
  return { target, currentTarget: target } as unknown as React.ChangeEvent<HTMLInputElement>;
}

export const Input = markFormFieldControl(
  React.forwardRef<HTMLInputElement, InputProps>(function Input(
    {
      icon,
      error: errorProp,
      showErrorMessage = false,
      className,
      inputClassName,
      value,
      defaultValue,
      onChange,
      type = "text",
      id,
      name,
      disabled,
      readOnly,
      required,
      placeholder,
      autoFocus,
      min,
      max,
      step,
      inputMode,
      "aria-label": ariaLabel,
      "aria-describedby": ariaDescribedBy,
      ...rest
    },
    ref
  ) {
    const field = useFormFieldContext();
    // Sin `value`: campo no controlado (defaultValue), el estado vive aquí.
    const [inner, setInner] = useState(String(defaultValue ?? ""));
    const current = value === undefined ? inner : String(value ?? "");

    const direct = field?.direct === true;
    const label = field?.label ?? ariaLabel ?? placeholder ?? name ?? "Campo";
    const error = errorProp ?? (direct ? field?.error : undefined);
    const showMessage = direct || showErrorMessage;
    const status = error ? { type: "error" as const, message: showMessage ? error : undefined } : undefined;

    const common = {
      id,
      label,
      isLabelHidden: !direct,
      // Anidado en un FormField que dibuja su <Field>: el nombre accesible es esa etiqueta.
      "aria-labelledby": field && !direct ? field.labelId : undefined,
      "aria-describedby": direct ? undefined : ariaDescribedBy,
      description: direct ? field?.hint : undefined,
      isRequired: direct ? field?.required : required,
      isDisabled: disabled,
      isReadOnly: readOnly,
      placeholder,
      hasAutoFocus: autoFocus,
      htmlName: name,
      status,
      startIcon: icon as IconType | undefined,
      width: "100%",
      containerClassName: className,
      controlClassName: inputClassName,
    };

    if (type === "number") {
      return (
        <NumberInput
          {...common}
          value={current === "" ? null : Number(current)}
          min={min === undefined ? undefined : Number(min)}
          max={max === undefined ? undefined : Number(max)}
          step={step === undefined || step === "any" ? undefined : Number(step)}
          onChange={(n) => {
            const v = Number.isFinite(n) ? String(n) : "";
            if (value === undefined) setInner(v);
            onChange?.(numberEvent(v, name, id));
          }}
          onBlur={rest.onBlur}
          onFocus={rest.onFocus}
          onKeyDown={rest.onKeyDown}
        />
      );
    }

    return (
      <TextInput
        {...(rest as object)}
        {...common}
        // No controlado: el código existente a veces restaura el valor
        // escribiendo en el DOM al perder el foco (`event.target.value = …`);
        // se lee de vuelta para que el siguiente render no lo deshaga.
        onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
          rest.onBlur?.(e);
          if (value === undefined) setInner(e.target.value);
        }}
        ref={ref}
        type={TEXT_TYPES.has(type) ? (type as TextType) : "text"}
        inputMode={inputMode as React.ComponentProps<typeof TextInput>["inputMode"]}
        value={current}
        onChange={(v, e) => {
          if (value === undefined) setInner(v);
          onChange?.(e);
        }}
      />
    );
  })
);
