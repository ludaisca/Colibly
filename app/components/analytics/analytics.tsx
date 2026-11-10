"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import type { AnalyticsConfig } from "@/lib/analytics/config";
import { consentCookieDomain, readConsent, track, withCampaignParams, writeConsent, type Consent } from "@/lib/analytics/client";

declare global {
  interface Window {
    dataLayer?: unknown[];
    _fbq?: unknown;
  }
}

// Avisa a los componentes de esta pestaña que cambió la elección guardada.
const CONSENT_CHANGE_EVENT = "colibly:consent-change";

function subscribeConsent(onChange: () => void) {
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Cambia la elección guardada y avisa a los componentes de esta pestaña.
function saveConsent(value: Consent | null) {
  writeConsent(value);
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

function injectScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

// Última ruta con PageView enviado. Vive en el módulo (no en el componente)
// porque landing y registro tienen layouts distintos: al pasar de uno a otro
// sin recargar, el componente se monta de nuevo pero el Pixel sigue cargado.
let lastPageViewPath: string | null = null;

function loadMetaPixel(pixelId: string) {
  if (window.fbq) return;
  // Stub oficial del Pixel: encola llamadas hasta que carga fbevents.js.
  type Stub = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[][]; push: unknown; loaded: boolean; version: string };
  const stub = function (...args: unknown[]) {
    if (stub.callMethod) stub.callMethod(...args);
    else stub.queue.push(args);
  } as Stub;
  stub.queue = [];
  stub.push = stub;
  stub.loaded = true;
  stub.version = "2.0";
  window.fbq = stub;
  window._fbq = stub;
  injectScript("https://connect.facebook.net/en_US/fbevents.js");
  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
  lastPageViewPath = window.location.pathname;
}

function loadGoogleTag(config: AnalyticsConfig) {
  const primary = config.gaMeasurementId ?? config.googleAdsId;
  if (!primary || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js necesita el objeto `arguments`, no un arreglo.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${primary}`);
  window.gtag("js", new Date());
  if (config.gaMeasurementId) {
    // _ga en el dominio raíz para que web y app compartan el cliente; ?ga_debug=1 abre DebugView.
    const cookieDomain = consentCookieDomain();
    window.gtag("config", config.gaMeasurementId, {
      ...(cookieDomain ? { cookie_domain: cookieDomain } : {}),
      ...(new URLSearchParams(window.location.search).get("ga_debug") === "1" ? { debug_mode: true } : {}),
    });
  }
  if (config.googleAdsId) window.gtag("config", config.googleAdsId);
  if (config.googleAdsId && config.googleAdsSignupLabel) {
    window.__colibly_analytics = { googleAdsSignup: `${config.googleAdsId}/${config.googleAdsSignupLabel}` };
  }
}

/**
 * Medición del sitio público. Los scripts de Meta y Google se cargan solo
 * después de que el visitante acepta en el aviso de cookies; también conecta
 * los eventos de la página: clics en elementos con `data-track`, la vista de
 * #precios y las preguntas abiertas.
 */
export function Analytics({ config }: { config: AnalyticsConfig }) {
  // undefined en el servidor (y durante la hidratación): el aviso solo
  // aparece cuando ya se leyó localStorage, sin desajuste de hidratación.
  const consent = useSyncExternalStore<Consent | null | undefined>(subscribeConsent, readConsent, () => undefined);
  const pathname = usePathname();

  // Los CTA a /register llevan la campaña (utm_*, gclid, fbclid…) de la página
  // actual hasta el registro en app.colibly.com; el 308 de proxy.ts conserva la
  // query. No depende del consentimiento: solo copia parámetros de la URL.
  useEffect(() => {
    const decorate = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!a || !window.location.search) return;
      const next = withCampaignParams(a.getAttribute("href") ?? "", window.location.search, window.location.href);
      if (!next) return;
      a.href = next;
      // Clic normal: navegamos nosotros para que Next/Link no use su href original.
      if (e.type === "click" && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && (!a.target || a.target === "_self")) {
        e.preventDefault();
        e.stopPropagation();
        window.location.assign(next);
      }
    };
    document.addEventListener("click", decorate, true);
    document.addEventListener("auxclick", decorate, true);
    return () => {
      document.removeEventListener("click", decorate, true);
      document.removeEventListener("auxclick", decorate, true);
    };
  }, []);

  useEffect(() => {
    if (consent !== "granted") return;
    if (config.metaPixelId) loadMetaPixel(config.metaPixelId);
    loadGoogleTag(config);
  }, [consent, config]);

  // Navegación entre páginas del sitio sin recargar: el Pixel no la detecta
  // solo (GA4 sí, con la medición mejorada).
  useEffect(() => {
    if (consent !== "granted" || !window.fbq || lastPageViewPath === pathname) return;
    window.fbq("track", "PageView");
    lastPageViewPath = pathname;
  }, [consent, pathname]);

  useEffect(() => {
    if (consent !== "granted") return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-track]");
      if (el?.dataset.track === "cta") track({ name: "cta_click", location: el.dataset.trackLocation ?? "sin_ubicacion" });
    };
    const onToggle = (e: Event) => {
      const d = e.target as HTMLDetailsElement;
      if (d.tagName === "DETAILS" && d.open && d.dataset.track === "faq") {
        track({ name: "faq_open", question: d.querySelector("summary")?.textContent?.replace(/\+$/, "").trim() ?? "" });
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("toggle", onToggle, true);

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("toggle", onToggle, true);
    };
  }, [consent, pathname]);

  // La landing mide cuando la sección #precios entra en pantalla; la página
  // /precios no tiene esa sección, así que se mide al montar.
  useEffect(() => {
    if (consent !== "granted") return;
    if (pathname === "/precios") {
      track({ name: "view_pricing" });
      return;
    }
    const pricing = document.getElementById("precios");
    if (!pricing) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          track({ name: "view_pricing" });
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(pricing);
    return () => observer.disconnect();
  }, [consent, pathname]);

  const decide = (value: Consent) => saveConsent(value);

  if (consent !== null) return null;
  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-border bg-surface p-4 text-sm text-foreground shadow-lg sm:inset-x-auto sm:left-4 sm:max-w-md"
    >
      <p>
        Usamos cookies para saber qué anuncios nos traen visitas y mejorar esta página. Puedes aceptarlas o
        rechazarlas; el sitio funciona igual.{" "}
        <Link href="/privacidad#cookies" className="font-medium text-accent-ink underline underline-offset-2">
          Aviso de privacidad
        </Link>
      </p>
      {/* En móvil los botones van a la izquierda: a la derecha queda la burbuja del chat web. */}
      <div className="mt-3 flex justify-start gap-2 sm:justify-end">
        <Button variant="secondary" onClick={() => decide("denied")}>Rechazar</Button>
        <Button onClick={() => decide("granted")}>Aceptar</Button>
      </div>
    </div>
  );
}

/** Botón del footer para volver a mostrar el aviso de cookies. */
export function CookiePreferencesButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => saveConsent(null)}>
      Preferencias de cookies
    </button>
  );
}
