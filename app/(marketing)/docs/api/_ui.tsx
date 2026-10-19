import type React from "react";

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-24 space-y-4 [&_p]:max-w-3xl [&_ul]:max-w-3xl">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-4 font-display text-lg font-semibold">{children}</h3>;
}

// Bloque de código en grafito (paleta "Menta y grafito"), con scroll propio
// para que una línea larga no rompa el ancho en el celular.
export function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 max-w-full overflow-x-auto rounded-lg bg-accent-2 px-4 py-3 font-mono text-[13px] leading-relaxed text-white">
      <code>{children}</code>
    </pre>
  );
}

export function ParamTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-3 max-w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead className="bg-surface-light text-muted-strong">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border align-top">
              {r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
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
