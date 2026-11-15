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
