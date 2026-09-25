import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: { default: BRAND_NAME, template: `%s · ${BRAND_NAME}` },
  description: `${BRAND_NAME} — ${BRAND_TAGLINE}: WhatsApp, Instagram, Messenger, Telegram y tu web en una sola bandeja, con bots de IA y automatizaciones.`,
  icons: {
    icon: [
      {
        url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="%23F5B700"><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(0 16 16)"/><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(30 16 16)"/><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(60 16 16)"/><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(90 16 16)"/><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(120 16 16)"/><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(150 16 16)"/><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(180 16 16)"/><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(210 16 16)"/><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(240 16 16)"/><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(270 16 16)"/><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(300 16 16)"/><ellipse cx="16" cy="6.2" rx="3.1" ry="5.4" transform="rotate(330 16 16)"/></g><circle cx="16" cy="16" r="6.6" fill="%238F5F00"/></svg>',
        type: "image/svg+xml",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
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
