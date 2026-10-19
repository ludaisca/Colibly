import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/app-url";
import { requestHost } from "@/lib/request-host";

// Dinámico: el mismo contenedor sirve los dos dominios, con reglas distintas.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = requestHost(await headers());
  const appHost = process.env.APP_URL ? new URL(process.env.APP_URL).hostname.toLowerCase() : null;
  const siteHost = process.env.SITE_URL ? new URL(process.env.SITE_URL).hostname.toLowerCase() : null;
  if (appHost && siteHost && appHost !== siteHost && host === appHost) {
    // En app.* solo se indexa la documentación pública de la API.
    return { rules: { userAgent: "*", allow: ["/docs/"], disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/eliminacion-de-datos/"] },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
