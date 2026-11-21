"use client";

import React, { isValidElement, useId } from "react";
import { Field } from "@astryxdesign/core/Field";
import { FORM_FIELD_CONTROL, FormFieldContext, type FormFieldContextValue } from "./form-field-context";

// Adaptador (rediseño con Astryx): misma API de siempre.
// - Hijo directo que es un control adaptado (Input, Textarea…): ese control
//   dibuja el campo completo de Astryx con la etiqueta/error/ayuda de aquí.
// - Cualquier otro hijo: se envuelve en el <Field> de Astryx.

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: (id: string, describedBy?: string) => React.ReactNode;
}

export function FormField({ label, required, error, hint, className, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const node = children(id, describedBy);
  const direct =
    isValidElement(node) &&
    typeof node.type !== "string" &&
    (node.type as unknown as Record<symbol, unknown>)[FORM_FIELD_CONTROL] === true;

  const ctx: FormFieldContextValue = { id, label, required, error, hint, direct, labelId: `${id}-label` };

  if (direct) {
    return (
      <FormFieldContext value={ctx}>
        <div className={className}>{node}</div>
      </FormFieldContext>
    );
  }

  return (
    <FormFieldContext value={ctx}>
      <Field
        label={label}
        inputID={id}
        labelID={ctx.labelId}
        isRequired={required}
        description={hint && !error ? hint : undefined}
        descriptionID={hintId}
        status={error ? { type: "error", message: error, messageID: errorId } : undefined}
        statusVariant="detached"
        width="100%"
        className={className}
      >
        {node}
      </Field>
    </FormFieldContext>
  );
}
