import type { ReactNode } from "react";
import { BrandMark, Logo } from "@/app/components/ui/logo";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/app/components/ui/cn";

// Página de referencia de la marca Nexo (aplicada en BrandMark / favicon / OG).

function Frame({
  children,
  label,
  note,
  className,
}: {
  children: ReactNode;
  label: string;
  note: string;
  className?: string;
}) {
  return (
    <figure className={cn("rounded-2xl border border-border bg-surface p-5", className)}>
      <div className="flex min-h-36 items-center justify-center rounded-xl bg-background">{children}</div>
      <figcaption className="mt-4">
        <p className="font-display text-lg font-semibold">{label}</p>
        <p className="mt-1 text-sm text-muted">{note}</p>
      </figcaption>
    </figure>
  );
}

/** Nexo en Laguna, sin tile (para fondos de acento). */
function MarkNexoBare({ className, fill = "var(--on-accent)" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-16 w-16", className)} aria-hidden>
      <path
        fill={fill}
        fillRule="evenodd"
        d="M21.57 20.68A8.26 8.26 0 1 1 21.57 10.52L18.86 12.63A4.82 4.82 0 1 0 18.86 18.57ZM22.26 13.79L25.18 15.47L22.26 17.16Z"
      />
    </svg>
  );
}

export function LogoConcepts() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
      <header className="max-w-2xl">
        <p className="text-sm font-medium text-muted-strong">
          Marca aplicada · Nexo ·{" "}
          <a href="/marca" className="text-accent-ink underline underline-offset-2">
            paleta Laguna
          </a>
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Logo Colibly
        </h1>
        <p className="mt-3 text-muted">
          C geométrica + triángulo al este: conexión y avance. Ya cableada en header, favicon, ícono de iOS e imagen
          para compartir.
        </p>
      </header>

      <h2 className="mt-12 font-display text-xl font-semibold">Símbolo</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Frame label="App / favicon" note="Tile Laguna + Nexo en blanco.">
          <BrandMark className="h-16 w-16" />
        </Frame>
        <Frame label="Lockup" note="Como en el header del panel y del sitio.">
          <Logo size="lg" />
        </Frame>
        <Frame label="Tamaños" note="64 · 32 · 16 — el triángulo debe seguir leyéndose.">
          <div className="flex items-end gap-4">
            <BrandMark className="h-16 w-16" />
            <BrandMark className="h-8 w-8" />
            <BrandMark className="h-4 w-4" />
          </div>
        </Frame>
      </div>

      <div className="mt-10 rounded-2xl border border-border bg-accent px-6 py-10 text-on-accent md:px-10">
        <p className="text-sm font-medium opacity-80">Sobre acento (correos / CTA)</p>
        <div className="mt-6 flex flex-wrap items-center gap-10">
          <div className="flex items-center gap-3">
            <MarkNexoBare className="h-12 w-12" fill="var(--on-accent)" />
            <span className="font-display text-2xl font-semibold tracking-tight">{BRAND_NAME}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-foreground px-6 py-10 md:px-10">
        <p className="text-sm font-medium text-white/80">Reverso (fondo oscuro)</p>
        <div className="mt-6 flex flex-wrap items-center gap-10">
          <MarkNexoBare className="h-12 w-12" fill="#FFFFFF" />
          <span className="font-display text-2xl font-semibold tracking-tight text-white">{BRAND_NAME}</span>
        </div>
      </div>

      <section className="mt-12 max-w-2xl border-t border-border pt-8 text-sm text-muted">
        <p>
          Masters y variantes (negro, blanco, mono Laguna, favicon, app icon):{" "}
          <code className="text-foreground">tmp/logo-design/kit/</code>. Guía breve:{" "}
          <code className="text-foreground">tmp/logo-design/kit/GUIDELINES.md</code>.
        </p>
      </section>
    </div>
  );
}
