// Paleta "Menta y grafito" en hex para lo que no puede leer los tokens CSS:
// correos, imágenes generadas (favicon, ícono de iOS, Open Graph) y el widget
// de chat web, que corre en páginas ajenas. Mismos valores que los primitivos
// de app/globals.css (tema claro): si cambia uno, cambiar el otro.
export const BRAND_COLORS = {
  accent: "#0F766E", // --teal-600: rellenos con texto blanco (5.5:1)
  accentHover: "#0B5F58", // --teal-700
  accentInk: "#0F766E", // texto en color de marca sobre fondo claro
  accentSubtle: "#DDF3EE", // --teal-100
  accentMuted: "#A9E3D6", // --teal-200
  mint: "#5EEAD4", // --teal-300: solo decorativo, nunca texto sobre claro
  onAccent: "#FFFFFF",
  graphite: "#2F3F3F", // --graphite-700: acento de apoyo
  ink: "#0F1A1A", // --ink-950: texto principal
  muted: "#465757", // --ink-600: texto secundario
  background: "#F2F9F7", // --ink-25
  surfaceLight: "#E4F1EE", // --ink-50
  border: "#D3E6E2", // --ink-100
  surface: "#FFFFFF",
} as const;
