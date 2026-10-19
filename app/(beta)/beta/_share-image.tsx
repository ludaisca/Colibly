import { TRIAL_DAYS } from "@/lib/billing/plans";
import { ImageResponse } from "next/og";
import { BRAND_NAME } from "@/lib/brand";
import { BRAND_COLORS as C } from "@/lib/brand-colors";
import { BRAND_MARK_BG, BRAND_MARK_FG, BRAND_MARK_PATH } from "@/lib/brand-mark";

export const alt = `Colibly: vende por WhatsApp sin perder conversaciones. ${TRIAL_DAYS} días sin costo.`;
export const size = { width: 1200, height: 630 };

export function betaShareImage() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "72px 80px", background: C.background, color: C.ink }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg width="64" height="64" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill={BRAND_MARK_BG} /><path d={BRAND_MARK_PATH} fill="none" stroke={BRAND_MARK_FG} strokeWidth="3.6" strokeLinecap="round" /></svg>
        <span style={{ fontSize: 38, fontWeight: 700 }}>{BRAND_NAME}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: C.accentInk, letterSpacing: 2 }}>REGISTRO ABIERTO</span>
        <span style={{ maxWidth: 1020, fontSize: 65, fontWeight: 700, lineHeight: 1.08 }}>Vende por WhatsApp sin perder conversaciones.</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <span style={{ borderRadius: 14, padding: "12px 22px", background: C.accent, color: C.onAccent, fontSize: 27, fontWeight: 700 }}>{TRIAL_DAYS} días sin costo</span>
        <span style={{ fontSize: 25 }}>Sin tarjeta · Cancela cuando quieras</span>
      </div>
    </div>,
    size,
  );
}
