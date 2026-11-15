import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import { appUrl, siteUrl } from "@/lib/app-url";
import { requestHost } from "@/lib/request-host";
import { isSiteHost } from "@/lib/app-url";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/app/components/theme-provider";
import "./globals.css";
import { Providers } from "./providers";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { BRAND_COLORS } from "@/lib/brand-colors";

// Mundo "Andén" (2026-11-07, docs/arquitectura/frontend.md): Barlow para todo
// y Barlow Condensed para títulos y cifras. Desde 2026-11-08 cubre toda la app
// (panel, sitio público, autenticación, CSAT, 404) con el marcador de abajo;
// Newsreader + Figtree ya no se cargan.
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

// Color de la barra del navegador móvil: concreto de día, andén de noche.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND_COLORS.andenConcrete },
    { media: "(prefers-color-scheme: dark)", color: BRAND_COLORS.andenNight },
  ],
};

// El dominio de cada petición se conoce en runtime. metadataBase usa SITE_URL
// para la web y APP_URL para el producto; Next resuelve con él las imágenes y
// otras URLs relativas de los metadatos.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const host = requestHost(await headers());
  const siteHost = process.env.SITE_URL ? new URL(process.env.SITE_URL).hostname.toLowerCase() : null;
  const appHost = process.env.APP_URL ? new URL(process.env.APP_URL).hostname.toLowerCase() : null;
  return {
    metadataBase: new URL(siteHost && host === siteHost ? siteUrl("/") : appUrl("/")),
    title: { default: BRAND_NAME, template: `%s · ${BRAND_NAME}` },
    description: `${BRAND_NAME} — ${BRAND_TAGLINE}: WhatsApp, Instagram, Messenger, Telegram y tu web en una sola bandeja, con bots de IA y automatizaciones.`,
    ...(appHost && siteHost && appHost !== siteHost && host === appHost ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // En el host del sitio (colibly.com) no hay sesión: la cookie vive en el host
  // de la app y pedir /api/auth/session allá rompe la CSP (punto 23).
  const onSiteHost = isSiteHost(requestHost(await headers()));
  return (
    <html
      lang="es"
      data-scroll-behavior="smooth"
      className={`${barlow.variable} ${barlowCondensed.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica el tema guardado antes de pintar (app/components/theme-provider.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh flex flex-col bg-background text-foreground">
        {/* Activa el mundo Andén en toda la app (globals.css, `:has([data-world="anden"])`). */}
        <span data-world="anden" hidden />
        <Providers sessionless={onSiteHost}>{children}</Providers>
      </body>
    </html>
  );
}
