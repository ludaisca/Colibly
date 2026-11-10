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

// El consentimiento vive en dos lugares: una cookie de primera parte y
// localStorage. La cookie, con Domain=colibly.com, la leen la web pública
// (colibly.com) y la app (app.colibly.com): una sola elección vale para ambos
// hosts, y así el registro mide el canal que trajo la visita. localStorage
// queda como respaldo (y como único almacén en desarrollo).
const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;
const CONSENT_ROOT_DOMAIN = "colibly.com";

/** "colibly.com" si estamos en ese dominio o en un subdominio; null en localhost y demás. */
export function consentCookieDomain(hostname: string = typeof location !== "undefined" ? location.hostname : ""): string | null {
  return hostname === CONSENT_ROOT_DOMAIN || hostname.endsWith(`.${CONSENT_ROOT_DOMAIN}`) ? CONSENT_ROOT_DOMAIN : null;
}

function cookieAttrs(domain: string | null): string {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  return `; Path=/; SameSite=Lax${secure}${domain ? `; Domain=${domain}` : ""}`;
}

function readConsentCookie(): Consent | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_KEY}=([^;]*)`));
    return m && (m[1] === "granted" || m[1] === "denied") ? m[1] : null;
  } catch {
    return null;
  }
}

export function readConsent(): Consent | null {
  const fromCookie = readConsentCookie();
  if (fromCookie) return fromCookie;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    const value: Consent | null = v === "granted" || v === "denied" ? v : null;
    // Elección guardada antes de existir la cookie: se migra para que la vea el otro host.
    if (value && consentCookieDomain()) document.cookie = `${CONSENT_KEY}=${value}; Max-Age=${CONSENT_MAX_AGE}${cookieAttrs(consentCookieDomain())}`;
    return value;
  } catch {
    return null;
  }
}

/** Guarda (o, con null, borra) la elección en cookie y localStorage. */
export function writeConsent(value: Consent | null): void {
  const domain = consentCookieDomain();
  try {
    if (value) {
      document.cookie = `${CONSENT_KEY}=${value}; Max-Age=${CONSENT_MAX_AGE}${cookieAttrs(domain)}`;
    } else {
      document.cookie = `${CONSENT_KEY}=; Max-Age=0${cookieAttrs(domain)}`;
      // Por si quedó una cookie solo del host de antes de compartirla.
      if (domain) document.cookie = `${CONSENT_KEY}=; Max-Age=0${cookieAttrs(null)}`;
    }
  } catch {}
  try {
    if (value) localStorage.setItem(CONSENT_KEY, value);
    else localStorage.removeItem(CONSENT_KEY);
  } catch {}
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

/** Parámetros de campaña que viajan de la web pública al registro. */
export const CAMPAIGN_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "gclid", "gbraid", "wbraid", "fbclid", "msclkid"] as const;

/**
 * `href` de un enlace a /register con los parámetros de campaña de `currentSearch`
 * copiados (sin pisar los que el enlace ya trae). null si el enlace no apunta a
 * /register o no hay nada que agregar.
 */
export function withCampaignParams(href: string, currentSearch: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.pathname !== "/register") return null;
  const current = new URLSearchParams(currentSearch);
  let changed = false;
  for (const key of CAMPAIGN_PARAMS) {
    const v = current.get(key);
    if (v && !url.searchParams.has(key)) {
      url.searchParams.set(key, v);
      changed = true;
    }
  }
  return changed ? url.toString() : null;
}
