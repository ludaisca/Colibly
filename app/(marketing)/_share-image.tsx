import { ImageResponse } from "next/og";
import { BRAND_NAME } from "@/lib/brand";
import { PLAN_LIST, TRIAL_DAYS } from "@/lib/billing/plans";

// Imagen que muestran WhatsApp, Facebook, X, etc. al compartir un enlace del
// sitio público (opengraph-image.tsx y twitter-image.tsx la reutilizan).
// Colores fijos de la paleta Girasol: una imagen no lee los tokens CSS.
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 };
export const SHARE_IMAGE_ALT = `${BRAND_NAME}: el CRM de WhatsApp con IA para negocios que venden por chat`;

const PETALS = Array.from({ length: 12 }, (_, i) => i * 30);

export function SunflowerSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      {PETALS.map((deg) => (
        <ellipse key={deg} cx="16" cy="6.2" rx="3.1" ry="5.4" fill="#F5B700" transform={`rotate(${deg} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="6.6" fill="#8F5F00" />
    </svg>
  );
}

export function renderShareImage() {
  const minPrice = Math.min(...PLAN_LIST.map((p) => p.priceUsd));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: "linear-gradient(135deg, #FBF8F2 55%, #FEF0C3 100%)", color: "#1C1917" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <SunflowerSvg size={64} />
          <span style={{ fontSize: 40, fontWeight: 700 }}>{BRAND_NAME}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: "#8F5F00", textTransform: "uppercase", letterSpacing: 2 }}>CRM de WhatsApp con IA</span>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.08, maxWidth: 980 }}>Vende por WhatsApp sin dejar a ningún cliente en visto</span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <span style={{ display: "flex", background: "#F5B700", borderRadius: 16, padding: "12px 24px", fontSize: 30, fontWeight: 700 }}>Desde ${minPrice} USD al mes</span>
          <span style={{ display: "flex", border: "2px solid #ECE5D8", background: "#FFFFFF", borderRadius: 16, padding: "12px 24px", fontSize: 30 }}>{TRIAL_DAYS} días gratis, sin tarjeta</span>
        </div>
      </div>
    ),
    SHARE_IMAGE_SIZE
  );
}
