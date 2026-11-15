// Paleta congelada (noviembre 2026) en hex para lo que no puede leer los
// tokens CSS: correos, imágenes generadas (favicon, ícono de iOS, Open Graph)
// y el widget de chat web, que corre en páginas ajenas. Mismos valores que
// los semánticos de app/globals.css (tema claro): si cambia uno, cambiar el otro.
export const BRAND_COLORS = {
  accent: "#0F6E7E", // --accent: rellenos con texto blanco (≥ 4.5:1)
  accentHover: "#0B5864", // --accent-hover
  accentInk: "#0B5D6A", // --accent-ink: texto en color de marca (≥ 7:1 sobre blanco)
  accentSubtle: "#E3F0F1", // --accent-subtle
  accentMuted: "#A9CFD4", // --accent-muted
  onAccent: "#FFFFFF",
  ink: "#17181A", // --foreground: texto principal
  muted: "#5E5F5A", // --muted: texto secundario
  subtle: "#8A8B84", // --subtle: solo metadatos ≥ 12 px
  background: "#F4F4F1", // --background
  andenConcrete: "#F4F4F1", // theme-color de día (= background)
  andenNight: "#111211", // theme-color de noche (= .dark --background)
  andenInk: "#17181A",
  andenHairline: "#E1E1DB",
  andenBubbleOut: "#DCEFEC", // --bubble-out
  surfaceLight: "#EEEEEA", // --surface-light
  border: "#E1E1DB", // --border
  borderStrong: "#93948D", // --border-strong
  surface: "#FFFFFF",
} as const;
