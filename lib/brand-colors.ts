// Paleta "Colibrí" en hex para lo que no puede leer los tokens CSS: correos,
// imágenes generadas (favicon, ícono de iOS, Open Graph) y el widget de chat
// web, que corre en páginas ajenas. Mismos valores que los primitivos de
// app/globals.css (tema claro): si cambia uno, cambiar el otro.
export const BRAND_COLORS = {
  accent: "#5B34E6", // --violet-600: rellenos con texto blanco (6.8:1)
  accentHover: "#4A26C9", // --violet-700
  accentInk: "#4A26C9", // texto en color de marca sobre fondo claro
  accentSubtle: "#EEE9FE", // --violet-100
  accentMuted: "#D9CFFC", // --violet-200
  onAccent: "#FFFFFF",
  ruby: "#FF4F7B", // --ruby-500: solo rellenos decorativos
  rubyInk: "#C21E4C", // --ruby-700
  ink: "#17132B", // --ink-950: texto principal
  muted: "#5F5A73", // --ink-600: texto secundario
  background: "#F8F6FC", // --ink-25
  surfaceLight: "#F1EEF8", // --ink-50
  border: "#E7E2F3", // --ink-100
  surface: "#FFFFFF",
} as const;
