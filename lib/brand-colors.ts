// Paleta "Laguna + coral" en hex para lo que no puede leer los tokens CSS:
// correos, imágenes generadas (favicon, ícono de iOS, Open Graph) y el widget
// de chat web, que corre en páginas ajenas. Mismos valores que los primitivos
// de app/globals.css (tema claro): si cambia uno, cambiar el otro.
export const BRAND_COLORS = {
  accent: "#0E7490", // --teal-600: rellenos con texto blanco (≥ 4.5:1)
  accentHover: "#0C5F75", // --teal-700
  accentInk: "#0A5A6E", // texto en color de marca sobre fondo claro
  accentSubtle: "#DDF0F5", // --teal-100
  accentMuted: "#9BD0DE", // --teal-200
  mint: "#67E8F9", // --teal-300: solo decorativo, nunca texto sobre claro
  onAccent: "#FFFFFF",
  coral: "#C21E4C", // --coral-600 / --accent-2: apoyo (badges, highlights)
  coralBg: "#FFE4EA", // --coral-50 / --accent-2-bg
  ink: "#0C1A22", // --ink-950: texto principal
  muted: "#5B6B7A", // --ink-600: texto secundario
  background: "#F3F6F8", // --ink-25: neutro frío (sin tinte cielo)
  surfaceLight: "#ECF0F3", // --ink-50
  border: "#D5DCE3", // --ink-100
  surface: "#FFFFFF",
} as const;
