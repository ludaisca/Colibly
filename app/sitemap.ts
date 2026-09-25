import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

// Solo el sitio público; el panel requiere sesión. Dinámico por APP_URL.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: appUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: appUrl("/terminos"), changeFrequency: "yearly", priority: 0.3 },
    { url: appUrl("/privacidad"), changeFrequency: "yearly", priority: 0.3 },
  ];
}
