import Link from "next/link";
import Script from "next/script";
import { Logo } from "@/app/components/ui/logo";
import { Button } from "@/app/components/ui/button";
import { Analytics, CookiePreferencesButton } from "@/app/components/analytics/analytics";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { getAnalyticsConfig } from "@/lib/analytics/config";
import { LEGAL } from "./_legal";
import { MobileNav } from "./_mobile-nav";

// 44 px de alto para tocar con el dedo; en escritorio vuelve a su altura de texto.
const FOOTER_LINK = "inline-flex min-h-11 items-center hover:text-foreground md:min-h-0";

const FOOTER_COLUMNS = [
  { title: "Producto", links: [{ href: "/#funciones", label: "Funciones" }, { href: "/#precios", label: "Precios" }, { href: "/#preguntas", label: "Preguntas frecuentes" }] },
  { title: "Cuenta", links: [{ href: "/register", label: "Crear cuenta" }, { href: "/login", label: "Entrar" }, { href: "/recuperar", label: "Recuperar contraseña" }] },
  { title: "Legal", links: [{ href: "/terminos", label: "Términos y condiciones" }, { href: "/privacidad", label: "Aviso de privacidad" }] },
];

// Nuestro propio widget de chat web en la landing (una cuenta WEBCHAT de la
// organización de SunflowCRM, con el dominio público en sus orígenes
// permitidos). Solo ids con forma de cuid: el valor va dentro de una URL.
function landingWebchatAccountId(): string | null {
  const id = process.env.LANDING_WEBCHAT_ACCOUNT_ID?.trim();
  return id && /^[a-z0-9]{20,40}$/i.test(id) ? id : null;
}

// El contacto se muestra cuando los datos legales dejan de ser marcadores.
const contactEmail = LEGAL.email.startsWith("[") ? null : LEGAL.email;

// Sitio público: landing, términos y privacidad. Sin sesión ni shell del panel.
// Siempre en tema claro: .theme-light restablece los tokens claros aunque el
// visitante haya elegido el oscuro en el panel (next-themes pone .dark en <html>).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const analytics = getAnalyticsConfig();
  const webchatId = landingWebchatAccountId();

  return (
    <div className="theme-light min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-sm">
        <div className="relative mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 md:gap-4 md:px-6">
          <Logo href="/" />
          <nav className="ml-auto hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Secciones">
            <Link href="/#funciones" className="hover:text-foreground">Funciones</Link>
            <Link href="/#precios" className="hover:text-foreground">Precios</Link>
            <Link href="/#preguntas" className="hover:text-foreground">Preguntas</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {/* En móvil "Entrar" vive en el menú para que quepan logo, botón y menú en 360 px. */}
            <span className="hidden md:block">
              <Button href="/login" variant="ghost">Entrar</Button>
            </span>
            <Button href="/register" data-track="cta" data-track-location="header">Prueba gratis</Button>
            <MobileNav />
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-border/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-muted md:grid-cols-[1.4fr_repeat(3,1fr)] md:px-6">
          <div className="space-y-3">
            <Logo href="/" />
            <p className="max-w-xs">{BRAND_TAGLINE}.</p>
            {contactEmail && (
              <p>
                Escríbenos: <a href={`mailto:${contactEmail}`} className="font-medium text-foreground hover:underline">{contactEmail}</a>
              </p>
            )}
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="mb-2 font-semibold text-foreground">{col.title}</p>
              <ul className="flex flex-col md:gap-2">
                {col.links.map((l) => (
                  <li key={l.href}><Link href={l.href} className={FOOTER_LINK}>{l.label}</Link></li>
                ))}
                {col.title === "Legal" && analytics && (
                  <li><CookiePreferencesButton className={`${FOOTER_LINK} cursor-pointer`} /></li>
                )}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-border/60">
          <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted md:px-6">© {new Date().getFullYear()} {BRAND_NAME}</p>
        </div>
      </footer>

      {analytics && <Analytics config={analytics} />}
      {webchatId && <Script src={`/api/webchat/${webchatId}/widget.js`} strategy="lazyOnload" />}
    </div>
  );
}
