import { HUE_CLASS, type HueIndex } from "@/app/components/ui/hue";

// Colores de etiqueta (client-safe). Se guardan como "accent" o "hue-0".."hue-7"
// y se pintan con las clases de hue.ts (nunca interpolando "hue-${n}").
export const TAG_COLOR_OPTIONS: { id: string; label: string }[] = [
  { id: "accent", label: "Teal" },
  { id: "hue-0", label: "Rojo" },
  { id: "hue-1", label: "Naranja" },
  { id: "hue-2", label: "Oliva" },
  { id: "hue-3", label: "Verde" },
  { id: "hue-4", label: "Turquesa" },
  { id: "hue-5", label: "Azul" },
  { id: "hue-6", label: "Morado" },
  { id: "hue-7", label: "Rosa" },
];

export function isTagColor(value: string): boolean {
  return TAG_COLOR_OPTIONS.some((option) => option.id === value);
}

/** Clases del punto de 7 px de una etiqueta. */
export function tagDotClass(color: string | null | undefined): string {
  const match = color?.match(/^hue-([0-7])$/);
  return match ? `${HUE_CLASS[Number(match[1]) as HueIndex]} bg-entity` : "bg-accent";
}

export interface TagUsage {
  sequences: { id: string; name: string }[];
  automations: { id: string; name: string }[];
}

/** Texto de la confirmación al eliminar una etiqueta que dispara algo. */
export function tagDeleteWarning(usage: TagUsage | null): string | null {
  if (!usage) return null;
  const quote = (items: { name: string }[]) => items.map((item) => `«${item.name}»`).join(", ");
  const parts: string[] = [];
  if (usage.sequences.length) {
    parts.push(`${usage.sequences.length === 1 ? "La secuencia" : "Las secuencias"} ${quote(usage.sequences)}`);
  }
  if (usage.automations.length) {
    parts.push(`${usage.automations.length === 1 ? "la automatización" : "las automatizaciones"} ${quote(usage.automations)}`);
  }
  if (!parts.length) return null;
  const many = usage.sequences.length + usage.automations.length > 1;
  const sentence = parts.join(" y ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} ${many ? "la usan como disparador; dejarán" : "la usa como disparador; dejará"} de dispararse.`;
}
