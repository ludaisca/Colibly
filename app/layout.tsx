import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import { appUrl, siteUrl } from "@/lib/app-url";
import { requestHost } from "@/lib/request-host";
import { Barlow, Barlow_Condensed, Figtree, Newsreader } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Providers } from "./providers";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { BRAND_COLORS } from "@/lib/brand-colors";

// Tipografía de marca (2026-10-25): Newsreader (display) + Figtree (body).
// Reserva documentada: Syne + DM Sans — ver docs/TIPOGRAFIA.md.
const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const figtree = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

// Mundo "Andén" del panel (2026-11-07, docs/arquitectura/frontend.md):
// Barlow para todo y Barlow Condensed para títulos y cifras del tablero. Solo
// el panel lo activa (globals.css, `:root:has([data-world="anden"])`); la
// landing sigue con Newsreader + Figtree.
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

// Color de la barra del navegador móvil (paleta "Laguna"); en modo oscuro,
// el fondo noche del tema.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND_COLORS.accent },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      data-scroll-behavior="smooth"
      className={`${newsreader.variable} ${figtree.variable} ${barlow.variable} ${barlowCondensed.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
