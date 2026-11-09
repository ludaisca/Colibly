import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND_DOMAIN, BRAND_NAME } from "@/lib/brand";
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

// Andén (2026-11-08): concreto, tinta y el mismo arranque de la portada (el
// titular y un mensaje respondido). Sin etiqueta sobre el titular.
// Barlow (OFL, public/fonts): la imagen no ve las fuentes de next/font. Vive en
// public/ porque es lo que el Dockerfile copia a la imagen de producción.
async function font(file: string) {
  return readFile(join(process.cwd(), "public/fonts", file));
}

export async function renderShareImage() {
  const [condensed, regular, semibold] = await Promise.all([
    font("BarlowCondensed-Bold.ttf"),
    font("Barlow-Regular.ttf"),
    font("Barlow-SemiBold.ttf"),
  ]);
  const minPrice = Math.min(...PLAN_LIST.map((p) => p.pricePerSeatMxn));
  const bubble = { display: "flex", borderRadius: 18, padding: "14px 20px", fontSize: 26, lineHeight: 1.3, maxWidth: 360 } as const;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", padding: "64px 72px", gap: 56, background: C.andenConcrete, color: C.andenInk, fontFamily: "Barlow" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <BrandMarkSvg size={56} />
            <span style={{ fontFamily: "Barlow Condensed", fontSize: 44, fontWeight: 700 }}>{BRAND_NAME}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "Barlow Condensed", fontSize: 76, fontWeight: 700, lineHeight: 0.98, letterSpacing: -1, whiteSpace: "nowrap" }}>Contesta cada chat,</span>
            <span style={{ fontFamily: "Barlow Condensed", fontSize: 76, fontWeight: 700, lineHeight: 0.98, letterSpacing: -1, whiteSpace: "nowrap" }}>aunque estés ocupado.</span>
          </div>
          <span style={{ display: "flex", fontSize: 26, color: C.muted }}>
            Desde {formatMxn(minPrice)} MXN por usuario · {TRIAL_DAYS} días gratis
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, width: 360 }}>
          <span style={{ ...bubble, background: C.surface, border: `2px solid ${C.andenHairline}`, alignSelf: "flex-start" }}>¿Cuánto cuesta el facial?</span>
          <span style={{ ...bubble, background: C.andenBubbleOut, alignSelf: "flex-end" }}>Cuesta $850 y dura 60 min. ¿Te agendamos?</span>
          <span style={{ display: "flex", justifyContent: "center", background: C.accent, color: C.onAccent, borderRadius: 12, padding: "14px 20px", fontSize: 26, fontWeight: 600 }}>Prueba {TRIAL_DAYS} días de Pro</span>
        </div>
      </div>
    ),
    {
      ...SHARE_IMAGE_SIZE,
      fonts: [
        { name: "Barlow Condensed", data: condensed, weight: 700, style: "normal" },
        { name: "Barlow", data: regular, weight: 400, style: "normal" },
        { name: "Barlow", data: semibold, weight: 600, style: "normal" },
      ],
    }
  );
}

// Imagen de un post del blog (blog/[slug]/opengraph-image.tsx): categoría y
// título sobre el mismo concreto y tinta de la portada.
export async function renderPostShareImage(title: string, category: string) {
  const [condensed, regular, semibold] = await Promise.all([
    font("BarlowCondensed-Bold.ttf"),
    font("Barlow-Regular.ttf"),
    font("Barlow-SemiBold.ttf"),
  ]);
  const size = title.length > 70 ? 64 : title.length > 45 ? 76 : 88;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: C.andenConcrete, color: C.andenInk, fontFamily: "Barlow" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <BrandMarkSvg size={56} />
          <span style={{ fontFamily: "Barlow Condensed", fontSize: 44, fontWeight: 700 }}>{BRAND_NAME}</span>
          <span style={{ display: "flex", marginLeft: 12, fontSize: 28, color: C.muted }}>Blog</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ display: "flex", fontSize: 30, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 2 }}>{category}</span>
          <span style={{ display: "flex", fontFamily: "Barlow Condensed", fontSize: size, fontWeight: 700, lineHeight: 1, letterSpacing: -1 }}>{title}</span>
        </div>
        <span style={{ display: "flex", fontSize: 26, color: C.muted }}>{BRAND_DOMAIN}/blog</span>
      </div>
    ),
    {
      ...SHARE_IMAGE_SIZE,
      fonts: [
        { name: "Barlow Condensed", data: condensed, weight: 700, style: "normal" },
        { name: "Barlow", data: regular, weight: 400, style: "normal" },
        { name: "Barlow", data: semibold, weight: 600, style: "normal" },
      ],
    }
  );
}
