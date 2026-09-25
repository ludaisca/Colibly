import type { Metadata } from "next";
import { connection } from "next/server";
import { appUrl } from "@/lib/app-url";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Providers } from "./providers";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

// El dominio público solo se conoce en tiempo de ejecución (APP_URL), así que
// los metadatos se resuelven por petición. metadataBase va aquí, en la raíz:
// Next resuelve con él las URLs relativas de canonical y Open Graph, y también
// las de las imágenes generadas por archivo (opengraph-image, twitter-image).
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return {
    metadataBase: new URL(appUrl("/")),
    title: { default: BRAND_NAME, template: `%s · ${BRAND_NAME}` },
    description: `${BRAND_NAME} — ${BRAND_TAGLINE}: WhatsApp, Instagram, Messenger, Telegram y tu web en una sola bandeja, con bots de IA y automatizaciones.`,
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
      className={`${bricolage.variable} ${hankenGrotesk.variable} antialiased`}
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
