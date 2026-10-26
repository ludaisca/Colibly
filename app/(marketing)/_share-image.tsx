import { ImageResponse } from "next/og";
import { BRAND_NAME } from "@/lib/brand";
import { BRAND_MARK_BG, BRAND_MARK_FG, BRAND_MARK_PATH } from "@/lib/brand-mark";
import { BRAND_COLORS as C } from "@/lib/brand-colors";
import { formatMxn, PLAN_LIST, TRIAL_DAYS } from "@/lib/billing/plans";

// Imagen que muestran WhatsApp, Facebook, X, etc. al compartir un enlace del
// sitio público (opengraph-image.tsx y twitter-image.tsx la reutilizan).
// Colores fijos de la paleta actual: una imagen no lee los tokens CSS.
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 };
export const SHARE_IMAGE_ALT = `${BRAND_NAME}: el CRM de WhatsApp con IA para negocios que venden por chat`;

// Nexo para imágenes generadas (también la usa app/apple-icon.tsx).
export function BrandMarkSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="9" fill={BRAND_MARK_BG} />
      <path d={BRAND_MARK_PATH} fill={BRAND_MARK_FG} fillRule="evenodd" />
    </svg>
  );
}

export function renderShareImage() {
  const minPrice = Math.min(...PLAN_LIST.map((p) => p.pricePerSeatMxn));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: C.background, color: C.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <BrandMarkSvg size={64} />
          <span style={{ fontSize: 40, fontWeight: 700 }}>{BRAND_NAME}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: C.accentInk, textTransform: "uppercase", letterSpacing: 2 }}>CRM de WhatsApp con IA</span>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.08, maxWidth: 980 }}>Vende por WhatsApp sin dejar a ningún cliente en visto</span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <span style={{ display: "flex", background: C.accent, color: C.onAccent, borderRadius: 16, padding: "12px 24px", fontSize: 30, fontWeight: 700 }}>Desde {formatMxn(minPrice)} MXN por ejecutivo</span>
          <span style={{ display: "flex", border: `2px solid ${C.border}`, background: C.surface, borderRadius: 16, padding: "12px 24px", fontSize: 30 }}>{TRIAL_DAYS} días gratis, sin tarjeta</span>
        </div>
      </div>
    ),
    SHARE_IMAGE_SIZE
  );
}
