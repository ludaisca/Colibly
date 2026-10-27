import type React from "react";
import { CopyButton } from "./_copy-button";

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
// rompa el ancho en el celular. El botón de copiar deja aire arriba.
export function Code({ children }: { children: string }) {
  return (
    <pre className="relative mt-2 max-w-full overflow-x-auto overscroll-x-contain rounded-lg bg-code px-3 pb-3 pt-10 font-mono text-[12px] leading-relaxed text-code-foreground sm:px-4 sm:text-[13px]">
      <CopyButton text={children} />
      <code>{children}</code>
    </pre>
  );
}

export function ParamTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-3 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-border">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm sm:min-w-[32rem]">
        <thead className="bg-surface-light text-muted-strong">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-2.5 py-2 font-semibold sm:px-3">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border align-top">
              {r.map((c, j) => <td key={j} className="px-2.5 py-2 sm:px-3">{c}</td>)}
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
          <code key={i} className="font-mono text-[0.92em]">{p.slice(1, -1)}</code>
        ) : p.startsWith("**") ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}
