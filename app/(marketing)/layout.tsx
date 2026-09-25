import Link from "next/link";
import { Logo } from "@/app/components/ui/logo";
import { Button } from "@/app/components/ui/button";
import { BRAND_NAME } from "@/lib/brand";

// Sitio público: landing, términos y privacidad. Sin sesión ni shell del panel.
// Siempre en tema claro: .theme-light restablece los tokens claros aunque el
// visitante haya elegido el oscuro en el panel (next-themes pone .dark en <html>).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-light min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 md:px-6">
          <Logo href="/" />
          <nav className="ml-auto hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Secciones">
            <Link href="/#funciones" className="hover:text-foreground">Funciones</Link>
            <Link href="/#precios" className="hover:text-foreground">Precios</Link>
            <Link href="/#preguntas" className="hover:text-foreground">Preguntas</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Button href="/login" variant="ghost" size="sm">Entrar</Button>
            <Button href="/register" size="sm">Prueba gratis</Button>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between md:px-6">
          <p>© {new Date().getFullYear()} {BRAND_NAME}</p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal">
            <Link href="/terminos" className="hover:text-foreground">Términos y condiciones</Link>
            <Link href="/privacidad" className="hover:text-foreground">Aviso de privacidad</Link>
            <Link href="/login" className="hover:text-foreground">Entrar</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
