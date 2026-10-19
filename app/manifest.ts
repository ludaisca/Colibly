import type { MetadataRoute } from "next";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { BRAND_COLORS } from "@/lib/brand-colors";

// Manifiesto PWA: colores de la paleta "Menta y grafito".
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: BRAND_TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: BRAND_COLORS.background,
    theme_color: BRAND_COLORS.accent,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
