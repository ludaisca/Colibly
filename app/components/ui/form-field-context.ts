import { createContext, use } from "react";

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
