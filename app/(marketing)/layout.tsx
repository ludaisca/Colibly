import Link from "next/link";
import Script from "next/script";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Logo } from "@/app/components/ui/logo";
import { Button } from "@/app/components/ui/button";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { Analytics, CookiePreferencesButton } from "@/app/components/analytics/analytics";
import { BRAND_NAME, BRAND_SUPPORT_WHATSAPP_DISPLAY, BRAND_SUPPORT_WHATSAPP_URL, BRAND_TAGLINE } from "@/lib/brand";
import { getAnalyticsConfig } from "@/lib/analytics/config";
import { LEGAL } from "./_legal";
import { SiteMobileNav } from "@/app/components/ui/site-mobile-nav";
import { appUrl, isAppHost, siteHref } from "@/lib/app-url";
import { requestHost } from "@/lib/request-host";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { siteSchemaJson } from "@/lib/seo/site-schema";

const NAV_LINKS = [
  { path: "/#producto", label: "Producto" },
  { path: "/#como-funciona", label: "Cómo funciona" },
  { path: "/precios", label: "Precios" },
  { path: "/blog", label: "Blog" },
  { path: "/#preguntas", label: "Preguntas" },
];

// 44 px de alto para tocar con el dedo; en escritorio vuelve a su altura de texto.
const FOOTER_LINK = "inline-flex min-h-11 items-center hover:text-foreground md:min-h-0";

// Este layout también envuelve /docs/api en app.colibly.com. Ahí los enlaces del
// sitio van absolutos a SITE_URL (las anclas /#… en el host de la app acababan
// en /login) y como <a> simple, sin el prefetch de Next que la CSP del host de
// la app bloquea. En el propio sitio quedan relativos con <Link> (siteHref).
const FOOTER_COLUMNS = [
  { title: "Producto", links: [{ href: "/", label: "Conocer Colibly" }, { href: "/precios", label: "Planes y precios" }, { href: "/blog", label: "Blog" }, { href: "/guias", label: "Guías" }, { href: "/comparativas", label: "Comparativas" }, { href: "/crm-whatsapp", label: "CRM para WhatsApp" }, { href: "/chatbot-whatsapp-ia", label: "Chatbot de IA" }, { href: "/whatsapp-business-app-vs-api", label: "WhatsApp Business: app o API" }, { href: "/#preguntas", label: "Preguntas frecuentes" }, { href: appUrl("/docs/api"), label: "API para desarrolladores", external: true }] },
  { title: "Soporte", links: [{ href: "/contacto", label: "Contacto y soporte" }, { href: "/eliminar-datos", label: "Eliminar mis datos" }] },
  { title: "Legal", links: [{ href: "/terminos", label: "Términos y condiciones" }, { href: "/privacidad", label: "Aviso de privacidad" }, { href: "/privacidad#cookies", label: "Cookies y medición" }] },
];

// Nuestro propio widget de chat web en la landing (una cuenta WEBCHAT de la
// organización de Colibly, con el dominio público en sus orígenes
// permitidos). Solo ids con forma de cuid: el valor va dentro de una URL.
function landingWebchatAccountId(): string | null {
  const id = process.env.LANDING_WEBCHAT_ACCOUNT_ID?.trim();
  return id && /^[a-z0-9]{20,40}$/i.test(id) ? id : null;
}

// Enlace del sitio: <Link> relativo en colibly.com, <a> absoluto en el host de la app.
function SiteLink({ path, onAppHost, className, children }: { path: string; onAppHost: boolean; className?: string; children: React.ReactNode }) {
  if (onAppHost || !path.startsWith("/")) return <a href={siteHref(path, onAppHost)} className={className}>{children}</a>;
  return <Link href={path} className={className}>{children}</Link>;
}

// El contacto se muestra cuando los datos legales dejan de ser marcadores.
const contactEmail = LEGAL.email.startsWith("[") ? null : LEGAL.email;

// Sitio público: landing, términos y privacidad. Sin sesión ni shell del panel.
// Mundo Andén desde 2026-11-08 (el marcador vive en app/layout.tsx): lo que se
// ve aquí es lo que se recibe al entrar.
// Sigue el tema de la app (theme-provider.tsx) (claro por defecto; toggle en el header).
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Los ids de medición viven en PlatformSettings y se leen por petición.
  // Evita consultar PostgreSQL al prerenderizar el build aislado.
  await connection();
  const analytics = await getAnalyticsConfig();
  const webchatId = landingWebchatAccountId();
  const onAppHost = isAppHost(requestHost(await headers()));

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteSchemaJson() }} />
      <a
        href="#contenido-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100001] focus:rounded-[12px] focus:bg-surface focus:px-4 focus:py-3 focus:text-foreground focus:shadow-lg"
      >
        Saltar al contenido principal
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="relative mx-auto flex max-w-6xl items-center gap-1.5 px-3 py-2 min-[400px]:gap-2 min-[400px]:px-4 md:gap-4 md:px-6">
          <Logo href={siteHref("/", onAppHost)} className="min-w-0 shrink max-[360px]:[&_span.font-display]:sr-only" />
          <nav className="ml-auto hidden items-center gap-5 text-[15px] font-medium text-muted-darker lg:gap-6 md:flex" aria-label="Secciones">
            {NAV_LINKS.map((link) => (
              <SiteLink key={link.path} path={link.path} onAppHost={onAppHost} className="whitespace-nowrap hover:text-foreground">{link.label}</SiteLink>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 min-[400px]:gap-2 md:ml-0">
            {/* En móvil "Entrar" vive en el menú para que quepan logo, botón y menú en 360 px. */}
            <span className="hidden md:block">
              <Button href={appUrl("/login")} variant="ghost">Entrar</Button>
            </span>
            <Button
              href={appUrl("/register")}
              data-track="cta"
              data-track-location="header"
              className="!h-9 !px-3 !text-xs min-[400px]:!h-10 min-[400px]:!px-4 min-[400px]:!text-sm"
            >
              Probar {TRIAL_DAYS} días
            </Button>
            <span className="hidden sm:contents">
              <ThemeToggle />
            </span>
            <SiteMobileNav links={NAV_LINKS.map((link) => ({ href: siteHref(link.path, onAppHost), label: link.label }))} loginHref={appUrl("/login")} ctaHref={appUrl("/register")} ctaLabel={`Prueba ${TRIAL_DAYS} días de Pro`} trackLocation="menu" label="Menú principal" />
          </div>
        </div>
      </header>

      <main id="contenido-principal" tabIndex={-1} className="scroll-mt-20">{children}</main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-muted sm:grid-cols-2 lg:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))] lg:px-6 md:px-6">
          <div className="space-y-3 sm:col-span-2 lg:col-span-1">
            <Logo href={siteHref("/", onAppHost)} />
            <p className="max-w-xs text-pretty">{BRAND_TAGLINE}.</p>
            {contactEmail && (
              <p className="break-words">
                Escríbenos: <a href={`mailto:${contactEmail}`} className="font-medium text-foreground hover:underline">{contactEmail}</a>
              </p>
            )}
            <p className="break-words">
              WhatsApp: <a href={BRAND_SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">{BRAND_SUPPORT_WHATSAPP_DISPLAY}</a>
            </p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="min-w-0">
              <p className="mb-2 font-semibold text-foreground">{col.title}</p>
              <ul className="flex flex-col gap-0.5 md:gap-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {"external" in l ? <a href={l.href} className={FOOTER_LINK}>{l.label}</a> : <SiteLink path={l.href} onAppHost={onAppHost} className={FOOTER_LINK}>{l.label}</SiteLink>}
                  </li>
                ))}
                {col.title === "Legal" && analytics && (
                  <li><CookiePreferencesButton className={`${FOOTER_LINK} cursor-pointer`} /></li>
                )}
              </ul>
            </nav>
          ))}
          <nav aria-label="Cuenta" className="min-w-0">
            <p className="mb-2 font-semibold text-foreground">Cuenta</p>
            <a href={appUrl("/login")} className={FOOTER_LINK}>Entrar al producto</a>
          </nav>
        </div>
        <div className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 py-4 text-sm text-muted md:px-6">© {new Date().getFullYear()} {BRAND_NAME}</p>
        </div>
      </footer>

      {analytics && <Analytics config={analytics} />}
      {webchatId && <Script src={`/api/webchat/${webchatId}/widget.js`} strategy="lazyOnload" />}
    </div>
  );
}
