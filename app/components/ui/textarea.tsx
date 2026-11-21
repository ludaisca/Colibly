"use client";

import React, { useState } from "react";
import { TextArea } from "@astryxdesign/core/TextArea";
import { markFormFieldControl, useFormFieldContext } from "./form-field-context";

// Adaptador (rediseño con Astryx): misma API de siempre, dibujado por el
// TextArea de Astryx. Dentro de <FormField> toma de ahí etiqueta/error/ayuda.

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  showErrorMessage?: boolean;
}

export const Textarea = markFormFieldControl(
  React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
    {
      error: errorProp,
      showErrorMessage = false,
      className,
      value,
      defaultValue,
      onChange,
      id,
      name,
      disabled,
      readOnly,
      required,
      placeholder,
      rows,
      autoFocus,
      "aria-label": ariaLabel,
      "aria-describedby": ariaDescribedBy,
      ...rest
    },
    ref
  ) {
    const field = useFormFieldContext();
    const [inner, setInner] = useState(String(defaultValue ?? ""));
    const current = value === undefined ? inner : String(value ?? "");

    const direct = field?.direct === true;
    const error = errorProp ?? (direct ? field?.error : undefined);
    const showMessage = direct || showErrorMessage;

    return (
      <TextArea
        {...(rest as object)}
        ref={ref}
        id={id}
        label={field?.label ?? ariaLabel ?? placeholder ?? name ?? "Texto"}
        isLabelHidden={!direct}
        aria-labelledby={field && !direct ? field.labelId : undefined}
        aria-describedby={direct ? undefined : ariaDescribedBy}
        description={direct ? field?.hint : undefined}
        isRequired={direct ? field?.required : required}
        isDisabled={disabled}
        isReadOnly={readOnly}
        placeholder={placeholder}
        hasAutoFocus={autoFocus}
        htmlName={name}
        rows={rows}
        status={error ? { type: "error", message: showMessage ? error : undefined } : undefined}
        width="100%"
        containerClassName={className}
        value={current}
        onChange={(v, e) => {
          if (value === undefined) setInner(v);
          onChange?.(e);
        }}
      />
    );
  })
);
