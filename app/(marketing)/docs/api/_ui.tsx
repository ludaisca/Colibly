import type React from "react";

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-24 space-y-4 sm:mt-12 [&_p]:max-w-3xl [&_p]:text-pretty [&_ul]:max-w-3xl">
      <h2 className="text-pretty font-display text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
      {children}
    </section>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-4 font-display text-lg font-semibold">{children}</h3>;
}

// Bloque de código en grafito, con scroll propio para que una línea larga no
// rompa el ancho en el celular. Enfocable (tabIndex) para poder desplazarlo con
// el teclado (WCAG 2.1.1, axe scrollable-region-focusable). Los estilos del
// <pre>, de las tablas y del botón de copiar se declaran una sola vez en
// DOCS_STYLES (la página tiene ~190 bloques: repetir las clases en cada uno
// pesaba cientos de KB), y el botón lo maneja un solo CodeCopy para toda la
// página, que copia el texto del <code> vecino (QA-010).
export function Code({ children }: { children: string }) {
  return (
    <pre tabIndex={0} aria-label="Ejemplo de código">
      <button type="button" data-copy-code aria-label="Copiar código">Copiar</button>
      <code>{children}</code>
    </pre>
  );
}

/**
 * Clases del contenedor de la documentación: estilos de <pre>, botón de copiar
 * y tablas para todos los bloques. Literales completos: Tailwind no ve clases
 * armadas con interpolación.
 */
export const DOCS_STYLES = [
  "[&_pre]:relative [&_pre]:mt-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:overscroll-x-contain [&_pre]:rounded-lg [&_pre]:bg-code [&_pre]:px-3 [&_pre]:pb-3 [&_pre]:pt-10 [&_pre]:text-[12px] [&_pre]:leading-relaxed [&_pre]:text-code-foreground sm:[&_pre]:px-4 sm:[&_pre]:text-[13px]",
  "[&_[data-copy-code]]:absolute [&_[data-copy-code]]:right-2 [&_[data-copy-code]]:top-2 [&_[data-copy-code]]:z-10 [&_[data-copy-code]]:inline-flex [&_[data-copy-code]]:h-8 [&_[data-copy-code]]:items-center [&_[data-copy-code]]:rounded-md [&_[data-copy-code]]:border [&_[data-copy-code]]:border-code-foreground/20 [&_[data-copy-code]]:bg-code-foreground/10 [&_[data-copy-code]]:px-2 [&_[data-copy-code]]:font-sans [&_[data-copy-code]]:text-[11px] [&_[data-copy-code]]:font-medium [&_[data-copy-code]]:text-code-foreground [&_[data-copy-code]]:transition-colors [&_[data-copy-code]:hover]:bg-code-foreground/20 [&_[data-copy-code]:focus-visible]:outline-2 [&_[data-copy-code]:focus-visible]:outline-offset-2 [&_[data-copy-code]:focus-visible]:outline-code-foreground",
  "[&_[data-param-table]]:mt-3 [&_[data-param-table]]:max-w-full [&_[data-param-table]]:overflow-x-auto [&_[data-param-table]]:overscroll-x-contain [&_[data-param-table]]:rounded-lg [&_[data-param-table]]:border [&_[data-param-table]]:border-border",
  "[&_[data-param-table]_table]:w-full [&_[data-param-table]_table]:min-w-[28rem] [&_[data-param-table]_table]:border-collapse [&_[data-param-table]_table]:text-left [&_[data-param-table]_table]:text-sm sm:[&_[data-param-table]_table]:min-w-[32rem]",
  "[&_[data-param-table]_thead]:bg-surface-light [&_[data-param-table]_thead]:text-muted [&_[data-param-table]_th]:px-2.5 [&_[data-param-table]_th]:py-2 [&_[data-param-table]_th]:font-semibold sm:[&_[data-param-table]_th]:px-3",
  "[&_[data-param-table]_tbody_tr]:border-t [&_[data-param-table]_tbody_tr]:border-border [&_[data-param-table]_tbody_tr]:align-top [&_[data-param-table]_td]:px-2.5 [&_[data-param-table]_td]:py-2 sm:[&_[data-param-table]_td]:px-3",
].join(" ");

export function ParamTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div tabIndex={0} role="region" aria-label="Tabla de parámetros" data-param-table>
      <table>
        <thead>
          <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => <td key={j}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Descripciones del OpenAPI: `código` y **negritas**, nada más.
export function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") ? (
          <code key={i} className="text-[0.92em]">{p.slice(1, -1)}</code>
        ) : p.startsWith("**") ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}
