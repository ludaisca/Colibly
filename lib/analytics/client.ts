// Eventos del sitio público hacia Meta Pixel y Google (gtag). Solo actúan si
// los scripts ya se cargaron, cosa que pasa únicamente con consentimiento
// (app/components/analytics/analytics.tsx); si no, cada llamada es un no-op.

type Fbq = (...args: unknown[]) => void;
type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
    gtag?: Gtag;
    __colibly_analytics?: { googleAdsSignup?: string };
  }
}

export const CONSENT_KEY = "colibly_consent";
export type Consent = "granted" | "denied";

export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function hasConsent(): boolean {
  return readConsent() === "granted";
}

export type SiteEvent =
  | { name: "cta_click"; location: string }
  | { name: "view_pricing" }
  | { name: "faq_open"; question: string }
  | { name: "beta_apply" }
  | { name: "sign_up"; eventId: string };

export function track(event: SiteEvent): void {
  if (typeof window === "undefined") return;
  const { fbq, gtag } = window;
  switch (event.name) {
    case "cta_click":
      fbq?.("trackCustom", "CTAClick", { location: event.location });
      gtag?.("event", "cta_click", { location: event.location });
      break;
    case "view_pricing":
      fbq?.("track", "ViewContent", { content_name: "precios" });
      gtag?.("event", "view_pricing");
      break;
    case "faq_open":
      gtag?.("event", "faq_open", { question: event.question });
      break;
    case "beta_apply":
      fbq?.("track", "Lead", { content_name: "beta" });
      gtag?.("event", "generate_lead", { lead_source: "beta_landing" });
      break;
    case "sign_up": {
      // eventID igual al del evento que manda el servidor (Conversions API):
      // Meta los deduplica y cuenta un solo registro.
      fbq?.("track", "CompleteRegistration", {}, { eventID: event.eventId });
      gtag?.("event", "sign_up", { method: "email" });
      const sendTo = window.__colibly_analytics?.googleAdsSignup;
      if (sendTo) gtag?.("event", "conversion", { send_to: sendTo });
      break;
    }
  }
}

/** Id de evento para deduplicar navegador + servidor; solo si hay consentimiento. */
export function newAnalyticsEventId(): string | null {
  if (!hasConsent()) return null;
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
}
