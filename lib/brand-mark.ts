import { BRAND_COLORS } from "./brand-colors";

// Marca "Nexo" (C anular + triángulo al este) en colores fijos, para lo que no
// lee los tokens CSS: favicon (app/icon.svg), ícono de iOS e imágenes para
// compartir. El componente con tokens es BrandMark en app/components/ui/logo.tsx.
// Este archivo es el maestro del logo (el kit de exportaciones viejo se quitó del repo el 2026-11-08; queda en el historial de git).
export const BRAND_MARK_BG = BRAND_COLORS.accent;
export const BRAND_MARK_FG = BRAND_COLORS.onAccent;
/** Path relleno, viewBox 0 0 32 32 — usar con fillRule="evenodd". */
export const BRAND_MARK_PATH =
  "M21.57 20.68A8.26 8.26 0 1 1 21.57 10.52L18.86 12.63A4.82 4.82 0 1 0 18.86 18.57ZM22.26 13.79L25.18 15.47L22.26 17.16Z";
export const BRAND_MARK_VIEWBOX = "0 0 32 32";
