import { BRAND_COLORS } from "./brand-colors";

// La marca provisional ("C" sobre el acento) en colores fijos, para lo que no
// lee los tokens CSS: favicon (app/icon.svg, a mano con estos mismos valores),
// ícono de iOS e imágenes para compartir. El componente con tokens es
// BrandMark en app/components/ui/logo.tsx.
export const BRAND_MARK_BG = BRAND_COLORS.accent;
export const BRAND_MARK_FG = BRAND_COLORS.onAccent;
export const BRAND_MARK_PATH = "M21.1 11.2 A7 7 0 1 0 21.1 20.8";
