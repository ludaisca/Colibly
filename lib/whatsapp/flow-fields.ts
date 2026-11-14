// Campos de la respuesta de un WhatsApp Flow para mostrarlos en la bandeja.
// Meta nombra los campos de los Flows hechos con su editor como
// "screen_0_Nombre_0": se quitan el prefijo de pantalla y el índice final.
// Pura (la usa el cliente).

export interface FlowField {
  label: string;
  value: string;
}

export function flowFieldLabel(key: string): string {
  const cleaned = key
    .replace(/^screen_\d+_/i, "")
    .replace(/_\d+$/, "")
    .replace(/_/g, " ")
    .trim();
  const label = cleaned || key;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.map(valueText).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  // Las opciones de Meta llegan como "0_Opción_A": se muestra la opción.
  return String(value).replace(/^\d+_/, "").replace(/_/g, " ");
}

export function flowFields(data: Record<string, unknown> | null | undefined): FlowField[] {
  return Object.entries(data ?? {})
    .filter(([key]) => key !== "flow_token")
    .map(([key, value]) => ({ label: flowFieldLabel(key), value: valueText(value) }));
}
