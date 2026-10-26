import { ImageResponse } from "next/og";
import { BRAND_MARK_BG, BRAND_MARK_FG, BRAND_MARK_PATH } from "@/lib/brand-mark";

// Ícono para "Agregar a pantalla de inicio" en iOS: PNG con fondo (iOS no
// respeta transparencia). El favicon del navegador es app/icon.svg.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      // Nexo a sangre: iOS redondea las esquinas por su cuenta.
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_MARK_BG }}>
        <svg width={180} height={180} viewBox="0 0 32 32">
          <path d={BRAND_MARK_PATH} fill={BRAND_MARK_FG} fillRule="evenodd" />
        </svg>
      </div>
    ),
    size
  );
}
