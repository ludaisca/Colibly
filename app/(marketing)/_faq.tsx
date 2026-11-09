import { ChevronDown } from "lucide-react";

// Preguntas frecuentes como respuestas rápidas: la pregunta es un botón a lo
// ancho (papel, contorno, texto de acción, como «Ver precios») sobre el lienzo
// del hilo, y la respuesta se abre como una burbuja entrante. <details> nativo:
// funciona sin JavaScript, con teclado y con lector de pantalla.
export function LandingFaq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-surface-light p-3 sm:p-4">
      {items.map(({ q, a }, i) => (
        <details key={q} className="group" data-track="faq" open={i === 0}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-[9px] border border-border bg-surface px-4 py-3 text-left font-semibold text-accent-ink transition-colors hover:bg-background group-open:border-foreground group-open:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 text-pretty">{q}</span>
            <ChevronDown size={18} aria-hidden className="shrink-0 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="mb-2 mr-6 mt-2 rounded-xl rounded-tl-[3px] border border-border bg-bubble-in px-3.5 py-2.5 text-pretty text-[15px] leading-relaxed text-foreground">
            {a}
          </p>
        </details>
      ))}
    </div>
  );
}
