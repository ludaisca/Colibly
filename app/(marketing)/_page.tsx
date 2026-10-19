// Contenedor de las páginas informativas del sitio público (contacto, precios,
// eliminación de datos). Mismo estilo que las legales (LegalPage), sin el aviso
// de borrador. Desde lg: título e introducción a la izquierda (fijos al hacer
// scroll) y el contenido a la derecha, para no dejar media pantalla vacía.
export function InfoPage({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-6xl px-4 py-12 md:px-6 lg:grid lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:py-16">
      <header className="lg:sticky lg:top-24 lg:self-start">
        <h1 className="font-display text-page-title font-semibold tracking-tight lg:text-4xl lg:leading-tight">{title}</h1>
        {intro && <p className="mt-3 text-lg leading-relaxed text-muted-strong">{intro}</p>}
      </header>
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-foreground lg:mt-0 [&>:first-child]:mt-0 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:mt-1.5 [&_ol>li]:list-decimal [&_p]:text-foreground/90">
        {children}
      </div>
    </article>
  );
}

export const LINK = "text-accent-ink underline underline-offset-2";
