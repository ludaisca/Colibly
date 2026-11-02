// Atributos de conversación obligatorios al resolver (F4). Puro.
// Un valor cuenta si no está vacío ("false" de un sí/no SÍ es un valor).

export interface RequiredDefinition {
  key: string;
  label: string;
  required: boolean;
}

export function missingRequiredFields(
  definitions: RequiredDefinition[],
  values: unknown
): Array<{ key: string; label: string }> {
  const record = values && typeof values === "object" && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
  return definitions
    .filter((def) => def.required)
    .filter((def) => {
      const value = record[def.key];
      return value === undefined || value === null || (typeof value === "string" && !value.trim());
    })
    .map(({ key, label }) => ({ key, label }));
}

export const REQUIRED_FIELDS_CODE = "required_fields";

export function requiredFieldsMessage(missing: Array<{ label: string }>): string {
  return `Para resolver, completa: ${missing.map((field) => field.label).join(", ")}`;
}
