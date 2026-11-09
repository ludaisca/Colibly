import type { CSSProperties, ReactNode } from "react";
import { CheckCheck } from "lucide-react";
import { cn } from "@/app/components/ui/cn";
import { SeqPlay } from "./_seq-play";

// Hilo de conversación de la landing (dirección "la página es una
// conversación", brief en .impeccable/surfaces/app-marketing-page-tsx.md).
// Mismas burbujas que el panel Andén: entrante en papel, saliente en
// --bubble-out, hora y palomitas. Los mensajes llegan en orden (escribiendo →
// burbuja); con "reducir movimiento" o sin JavaScript todo aparece ya escrito.
// Las demoras salen de aquí y viajan como --d (ms) a globals.css → "Hilo".

export type ThreadItem =
  | { kind: "day"; text: string }
  | { kind: "in"; text: ReactNode; time: string }
  | { kind: "out"; text: ReactNode; time: string; sender?: string; typing?: boolean }
  | { kind: "note"; text: ReactNode }
  | { kind: "typing" };

const GAP_MS = 650;
const TYPING_MS = 1100;

/** Momento en que aparece cada elemento, y cuánto dura su "escribiendo…". */
function schedule(items: ThreadItem[], startMs: number) {
  let t = startMs;
  return items.map((item) => {
    const typingFor = item.kind === "out" && item.typing !== false ? TYPING_MS : 0;
    const at = t;
    t += typingFor + (item.kind === "day" ? 250 : GAP_MS);
    return { at, typingFor };
  });
}

function Dots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-hidden>
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted [animation-delay:150ms]" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted [animation-delay:300ms]" />
    </span>
  );
}

function Bubble({ item }: { item: Extract<ThreadItem, { kind: "in" | "out" }> }) {
  const out = item.kind === "out";
  return (
    <div
      className={cn(
        "max-w-[86%] rounded-xl px-3 pb-1.5 pt-2 text-[15px] leading-snug text-foreground",
        out ? "chat-bubble-out ml-auto rounded-tr-[3px] bg-bubble-out" : "mr-auto rounded-tl-[3px] border border-border bg-bubble-in"
      )}
    >
      {out && item.sender && <p className="mb-0.5 text-xs font-semibold text-accent-ink">{item.sender}</p>}
      <p className="text-pretty">{item.text}</p>
      <p className="mt-0.5 flex items-center justify-end gap-1 text-xs tabular-nums text-muted">
        {item.time}
        {out && <CheckCheck size={14} className="text-accent-ink" aria-label="Leído" />}
      </p>
    </div>
  );
}

/**
 * Tramo de conversación. `auto` arranca la secuencia con la página (portada);
 * sin `auto` espera a entrar en vista. `footer` (respuestas rápidas) nunca se
 * anima: la acción principal está visible desde el primer momento.
 */
export function Thread({
  items,
  label,
  auto = false,
  startMs = 300,
  footer,
  className,
}: {
  items: ThreadItem[];
  label: string;
  auto?: boolean;
  startMs?: number;
  footer?: ReactNode;
  className?: string;
}) {
  const times = schedule(items, startMs);
  const body = (
    <ol className="flex flex-col gap-2" aria-label={label}>
      {items.map((item, i) => {
        const { at, typingFor } = times[i];
        const style = { "--d": `${at}ms`, "--t": `${typingFor}ms` } as CSSProperties;
        if (item.kind === "day") {
          return (
            <li key={i} className="seq-in self-center" style={style}>
              <span className="rounded-full bg-surface px-2.5 py-0.5 text-micro font-semibold uppercase tracking-[0.08em] text-muted-darker">
                {item.text}
              </span>
            </li>
          );
        }
        if (item.kind === "note") {
          return (
            <li key={i} className="seq-in self-center text-center text-xs text-muted-darker" style={style}>
              {item.text}
            </li>
          );
        }
        if (item.kind === "typing") {
          return (
            <li key={i} className="seq-in mr-auto rounded-xl rounded-tl-[3px] border border-border bg-bubble-in px-3 py-2.5" style={style}>
              <Dots />
              <span className="sr-only">Escribiendo…</span>
            </li>
          );
        }
        // Burbuja y su "escribiendo…" comparten celda: el hueco queda
        // reservado desde el principio y nada se mueve al llegar el mensaje.
        return (
          <li key={i} className="grid" style={style}>
            {typingFor > 0 && (
              <span
                className="seq-typing pointer-events-none col-start-1 row-start-1 self-start justify-self-end rounded-xl rounded-tr-[3px] bg-bubble-out px-3 py-2.5 opacity-0"
                aria-hidden
              >
                <Dots />
              </span>
            )}
            <div className={cn("seq-in col-start-1 row-start-1", typingFor > 0 && "seq-after-typing")}>
              <Bubble item={item} />
            </div>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className={cn("rounded-xl bg-surface-light p-3 sm:p-4", className)}>
      {auto ? <div data-seq="auto">{body}</div> : <SeqPlay>{body}</SeqPlay>}
      {footer && <div className="mt-3 flex flex-col gap-2">{footer}</div>}
    </div>
  );
}

/** Respuesta rápida: botón a lo ancho, como los botones de WhatsApp. */
export function QuickReply({
  href,
  children,
  primary = false,
  track,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
  track?: string;
}) {
  return (
    <a
      href={href}
      data-track={track ? "cta" : undefined}
      data-track-location={track}
      className={cn(
        "flex min-h-11 items-center justify-center rounded-[9px] border px-4 py-2.5 text-center text-[15px] font-semibold transition-colors",
        primary
          ? "border-transparent bg-accent text-on-accent hover:bg-accent-hover"
          : "border-border bg-surface text-accent-ink hover:bg-surface-light"
      )}
    >
      {children}
    </a>
  );
}
