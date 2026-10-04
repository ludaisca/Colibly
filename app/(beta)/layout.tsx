import { connection } from "next/server";
import { Logo } from "@/app/components/ui/logo";
import { Analytics, CookiePreferencesButton } from "@/app/components/analytics/analytics";
import { getAnalyticsConfig } from "@/lib/analytics/config";
import { appUrl } from "@/lib/app-url";
import { BRAND_CONTACT_EMAIL, BRAND_NAME } from "@/lib/brand";

export default async function BetaLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const analytics = await getAnalyticsConfig();

  return (
    <div className="theme-light min-h-dvh bg-background text-foreground">
      <a href="#contenido-principal" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-3 focus:shadow-lg">Saltar al contenido principal</a>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
          <Logo href="/" size="lg" />
          <nav className="ml-auto hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Secciones">
            <a href="#como-funciona" className="hover:text-foreground">Cómo funciona</a>
            <a href="#incluye" className="hover:text-foreground">La beta</a>
            <a href="#preguntas" className="hover:text-foreground">Preguntas</a>
          </nav>
          <a href={appUrl("/login")} className="ml-auto hidden rounded-xl px-3 py-2 text-sm font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-strong md:ml-0 md:inline-flex">Entrar</a>
          <a href="#solicitar" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong" data-track="cta" data-track-location="beta_header">Solicitar acceso</a>
        </div>
      </header>

      <main id="contenido-principal" tabIndex={-1}>{children}</main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-9 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <Logo href="/" />
            <p className="mt-2 text-muted">Conversaciones que avanzan contigo.</p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-3 text-muted" aria-label="Enlaces del pie de página">
            <a href={`mailto:${BRAND_CONTACT_EMAIL}`} className="hover:text-foreground">{BRAND_CONTACT_EMAIL}</a>
            <a href="/terminos" className="hover:text-foreground">Términos</a>
            <a href="/privacidad" className="hover:text-foreground">Privacidad</a>
            {analytics && <CookiePreferencesButton className="cursor-pointer hover:text-foreground" />}
          </nav>
        </div>
        <p className="mx-auto max-w-6xl border-t border-border/70 px-4 py-4 text-xs text-muted md:px-6">© {new Date().getFullYear()} {BRAND_NAME}</p>
      </footer>
      {analytics && <Analytics config={analytics} />}
    </div>
  );
}
