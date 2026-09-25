import { ImageResponse } from "next/og";
import { SunflowerSvg } from "./(marketing)/_share-image";

// Ícono para "Agregar a pantalla de inicio" en iOS: PNG con fondo (iOS no
// respeta transparencia). El favicon del navegador es app/icon.svg.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBF8F2" }}>
        <SunflowerSvg size={140} />
      </div>
    ),
    size
  );
}
