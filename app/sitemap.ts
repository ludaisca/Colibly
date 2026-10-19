import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/app-url";

// Solo el sitio público; el panel requiere sesión. Dinámico por SITE_URL.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: siteUrl("/precios"), changeFrequency: "monthly", priority: 0.8 },
    { url: siteUrl("/contacto"), changeFrequency: "yearly", priority: 0.5 },
    { url: siteUrl("/eliminar-datos"), changeFrequency: "yearly", priority: 0.3 },
    { url: siteUrl("/terminos"), changeFrequency: "yearly", priority: 0.3 },
    { url: siteUrl("/privacidad"), changeFrequency: "yearly", priority: 0.3 },
  ];
}
