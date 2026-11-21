"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { InputGroup } from "@astryxdesign/core/InputGroup";
import { Button as AxButton } from "@astryxdesign/core/Button";
import { Icon as AxIcon } from "@astryxdesign/core/Icon";
import { Input } from "./input";
import { FormFieldContext, markFormFieldControl, useFormFieldContext } from "./form-field-context";

// Adaptador (rediseño con Astryx): InputGroup de Astryx con el campo y el
// botón "Mostrar contraseña" pegado (el TextInput de Astryx no lo trae).
// Dentro de <FormField> el grupo lleva la etiqueta, la ayuda y el error.
export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  error?: string;
  showErrorMessage?: boolean;
  showIcon?: boolean;
}

export const PasswordInput = markFormFieldControl(
  React.forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
    { showIcon = true, error: errorProp, showErrorMessage = false, className, required, ...props },
    ref
  ) {
    const [visible, setVisible] = useState(false);
    const field = useFormFieldContext();
    const direct = field?.direct === true;
    const label = field?.label ?? props["aria-label"] ?? props.placeholder ?? "Contraseña";
    const error = errorProp ?? (direct ? field?.error : undefined);
    const showMessage = direct || showErrorMessage;

    return (
      <div className={className}>
        <InputGroup
          label={label}
          isLabelHidden={!direct}
          description={direct ? field?.hint : undefined}
          isRequired={direct ? field?.required : required}
          status={error ? { type: "error", message: showMessage ? error : undefined } : undefined}
        >
          {/* El grupo ya pone la etiqueta: el campo no dibuja otra. */}
          <FormFieldContext.Provider value={null}>
            <Input
              {...props}
              ref={ref}
              type={visible ? "text" : "password"}
              icon={showIcon ? Lock : undefined}
              aria-label={label}
              aria-labelledby={field && !direct ? field.labelId : undefined}
              error={error}
            />
          </FormFieldContext.Provider>
          <AxButton
            label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            isIconOnly
            icon={<AxIcon icon={visible ? EyeOff : Eye} />}
            variant="secondary"
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          />
        </InputGroup>
      </div>
    );
  })
);
