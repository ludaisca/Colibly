import { BRAND_CONTACT_EMAIL, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { siteUrl } from "@/lib/app-url";

// Entidad de la marca para buscadores y asistentes de IA (GEO): quién es,
// cómo se llama el sitio y cómo contactarla. Se emite en todo el sitio
// público desde (marketing)/layout.tsx. Solo datos que ya son públicos: no se
// inventan redes sociales ni direcciones (sameAs se llena cuando existan).

export function siteSchemaJson(): string {
  const orgId = siteUrl("/#organization");
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": orgId,
      name: BRAND_NAME,
      legalName: "Colibly Inc.",
      url: siteUrl("/"),
      logo: siteUrl("/icon.svg"),
      description: BRAND_TAGLINE,
      areaServed: { "@type": "Country", name: "México" },
      knowsLanguage: "es-MX",
      contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: BRAND_CONTACT_EMAIL, availableLanguage: "es" }],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": siteUrl("/#website"),
      url: siteUrl("/"),
      name: BRAND_NAME,
      inLanguage: "es-MX",
      publisher: { "@id": orgId },
    },
  ];
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** BreadcrumbList de una página interna (Inicio → página). */
export function breadcrumbJson(items: { name: string; path: string }[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: BRAND_NAME, path: "/" }, ...items].map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: siteUrl(it.path),
    })),
  }).replace(/</g, "\\u003c");
}
