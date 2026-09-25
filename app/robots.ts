import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

// Dinámico: el dominio (APP_URL) solo existe en tiempo de ejecución.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: appUrl("/sitemap.xml"),
  };
}
