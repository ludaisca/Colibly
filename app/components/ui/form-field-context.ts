import { createContext, use, useState } from "react";
import { useRunOnChange } from "./use-run-on-change";

// Puente FormField → controles adaptados a Astryx (input, textarea…).
// Un control de Astryx (TextInput, TextArea…) trae su propia etiqueta, error y
// ayuda. Cuando es el hijo DIRECTO de un FormField, FormField no dibuja nada y
// el control pinta el campo completo con estos datos: una sola etiqueta.

export interface FormFieldContextValue {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  /** El control es el hijo directo y dibuja la etiqueta/error/ayuda él mismo. */
  direct: boolean;
  /** id de la etiqueta del <Field> de Astryx (cuando FormField la dibuja). */
  labelId: string;
}

export const FormFieldContext = createContext<FormFieldContextValue | null>(null);

export const useFormFieldContext = () => use(FormFieldContext);

/** Marca de los componentes que saben dibujar el campo completo de un FormField. */
export const FORM_FIELD_CONTROL = Symbol.for("colibly.formFieldControl");

export function markFormFieldControl<T extends object>(component: T): T {
  (component as Record<symbol, unknown>)[FORM_FIELD_CONTROL] = true;
  return component;
}

/**
 * Texto de un `<label htmlFor={id}>` que la pantalla dibuja fuera del control
 * (sin FormField). Sin esto, el control de Astryx se nombraba con su etiqueta
 * oculta de respaldo ("Opción", "Campo") en lugar de la visible. Se lee al
 * montar; `enabled` en false cuando el control ya tiene otro nombre.
 */
export function useExternalLabel(id: string | undefined, enabled: boolean): string | undefined {
  const [text, setText] = useState<string>();
  useRunOnChange(() => {
    if (!enabled || !id) return;
    // La etiqueta que dibuja Astryx también apunta al mismo id: se busca otra.
    const label = [...document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)].find((el) => !el.closest(".astryx-field"));
    const found = label?.textContent?.trim();
    if (found) setText(found);
  }, [id, enabled]);
  return text;
}
