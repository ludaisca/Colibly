// Idioma y categoría de una plantilla en español (revisión de pantallas,
// 2026-11-07): la interfaz mostraba los códigos de Meta tal cual
// ("en_US · UTILITY"). Puro: lo usan listas, selectores y métricas.

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidad",
  AUTHENTICATION: "Autenticación",
};

export function templateCategoryLabel(category: string | null | undefined): string {
  if (!category) return "";
  return CATEGORY_LABEL[category] ?? category;
}

let names: Intl.DisplayNames | null = null;

/** "en_US" → "Inglés estadounidense"; un código desconocido se devuelve tal cual. */
export function templateLanguageLabel(code: string | null | undefined): string {
  if (!code) return "";
  try {
    names ??= new Intl.DisplayNames(["es-MX"], { type: "language" });
    const label = names.of(code.replace("_", "-"));
    if (!label || label === code) return code;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return code;
  }
}
