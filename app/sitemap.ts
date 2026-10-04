import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/app-url";

// Solo el sitio público; el panel requiere sesión. Dinámico por SITE_URL.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: siteUrl("/terminos"), changeFrequency: "yearly", priority: 0.3 },
    { url: siteUrl("/privacidad"), changeFrequency: "yearly", priority: 0.3 },
  ];
}
