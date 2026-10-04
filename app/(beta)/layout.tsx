import { connection } from "next/server";
import { Logo } from "@/app/components/ui/logo";
import { Analytics, CookiePreferencesButton } from "@/app/components/analytics/analytics";
import { getAnalyticsConfig } from "@/lib/analytics/config";
import { appUrl } from "@/lib/app-url";
import { BRAND_CONTACT_EMAIL, BRAND_NAME } from "@/lib/brand";
import { StickyCta } from "./beta/_sticky-cta";

export default async function BetaLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const analytics = await getAnalyticsConfig();

  return (
    <div className="theme-light min-h-dvh bg-background text-foreground">
      <a href="#contenido-principal" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-3 focus:shadow-lg">Saltar al contenido principal</a>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 md:px-6">
          <Logo href="/" size="lg" />
          <nav className="ml-auto hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Secciones">
            <a href="#como-funciona" className="hover:text-foreground">Cómo funciona</a>
            <a href="#incluye" className="hover:text-foreground">La beta</a>
            <a href="#preguntas" className="hover:text-foreground">Preguntas</a>
          </nav>
          {/* Visible también en móvil: quien ya tiene cuenta debe poder entrar desde el teléfono. Bajo 360 px no cabe junto al CTA; ahí queda el enlace del pie. */}
          <a href={appUrl("/login")} className="ml-auto inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-strong max-[359px]:hidden sm:px-3 md:ml-0">Entrar</a>
          <a href="#solicitar" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl bg-accent px-4 text-sm font-semibold max-[359px]:ml-auto text-on-accent shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong" data-track="cta" data-track-location="beta_header">Solicitar acceso</a>
        </div>
      </header>

      <main id="contenido-principal" tabIndex={-1}>{children}</main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-9 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <Logo href="/" />
            <p className="mt-2 text-muted">Vende por WhatsApp sin perder conversaciones.</p>
          </div>
          <nav className="flex flex-wrap gap-x-5 text-muted" aria-label="Enlaces del pie de página">
            <a href={`mailto:${BRAND_CONTACT_EMAIL}`} className="inline-flex min-h-11 items-center hover:text-foreground">{BRAND_CONTACT_EMAIL}</a>
            <a href={appUrl("/login")} className="inline-flex min-h-11 items-center hover:text-foreground">Entrar</a>
            <a href="/terminos" className="inline-flex min-h-11 items-center hover:text-foreground">Términos</a>
            <a href="/privacidad" className="inline-flex min-h-11 items-center hover:text-foreground">Privacidad</a>
            {analytics && <CookiePreferencesButton className="inline-flex min-h-11 cursor-pointer items-center hover:text-foreground" />}
          </nav>
        </div>
        <p className="mx-auto max-w-6xl border-t border-border/70 px-4 py-4 text-xs text-muted md:px-6">© {new Date().getFullYear()} {BRAND_NAME}</p>
      </footer>
      <StickyCta />
      {analytics && <Analytics config={analytics} />}
    </div>
  );
}
