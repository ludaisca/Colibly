// Paleta "Laguna" en hex para lo que no puede leer los tokens CSS:
// correos, imágenes generadas (favicon, ícono de iOS, Open Graph) y el widget
// de chat web, que corre en páginas ajenas. Mismos valores que los primitivos
// de app/globals.css (tema claro): si cambia uno, cambiar el otro.
export const BRAND_COLORS = {
  accent: "#0E7490", // --teal-600: rellenos con texto blanco (≥ 4.5:1)
  accentHover: "#0C5F75", // --teal-700
  accentInk: "#0C5F75", // texto en color de marca sobre fondo claro
  accentSubtle: "#E0F2FE", // --teal-100
  accentMuted: "#7DD3FC", // --teal-200
  mint: "#67E8F9", // --teal-300: solo decorativo, nunca texto sobre claro
  onAccent: "#FFFFFF",
  graphite: "#334155", // --graphite-700: acento de apoyo
  ink: "#0C1A22", // --ink-950: texto principal
  muted: "#475569", // --ink-600: texto secundario
  background: "#F0F9FF", // --ink-25
  surfaceLight: "#E0F2FE", // --ink-50
  border: "#BAE6FD", // --ink-100
  surface: "#FFFFFF",
} as const;
