"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "./cn";
import {
  addMonths,
  fromISO,
  isOutOfBounds,
  monthGrid,
  moveByKey,
  pickInRange,
  startOfMonth,
  toISO,
  type IsoRange,
} from "@/lib/format/calendar";

// Calendario portado de `tsl-calendar` (Tesela, 2026-11-07) a React con los
// tokens de Colibly. Un solo calendario para fecha y rango (antes: uno hecho a
// mano y otro de HeroUI). Teclado: flechas (día/semana), Inicio/Fin (semana),
// Re Pág/Av Pág (mes; con Mayús, año), Enter/Espacio para elegir. Foco
// itinerante: solo el día enfocado está en el orden de tabulación. Andén: la
// selección se marca en tinta.

const LOCALE = "es-MX";

type SingleProps = {
  mode?: "single";
  value: string;
  onChange: (iso: string) => void;
};
type RangeProps = {
  mode: "range";
  value: IsoRange;
  /** Se llama solo con el rango completo. */
  onChange: (range: IsoRange) => void;
};

export type CalendarProps = (SingleProps | RangeProps) & {
  min?: string;
  max?: string;
  /** Meses visibles lado a lado (1 o 2). */
  months?: number;
  /** Enfocar el día activo al montar (al abrir dentro de un panel). */
  autoFocus?: boolean;
  className?: string;
};

// "septiembre de 2026" → "Septiembre de 2026" (CSS capitalize también subiría el "de").
function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function Calendar(props: CalendarProps) {
  const { min, max, months = 1, autoFocus = false, className } = props;
  const range = props.mode === "range";
  const committedStart = range ? (props.value as IsoRange).start : (props.value as string);
  const committedEnd = range ? (props.value as IsoRange).end : "";

  // Rango en curso (primer clic hecho, falta el segundo).
  const [draft, setDraft] = useState<{ start: string | null; end: string | null } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const start = draft ? draft.start : committedStart || null;
  const end = draft ? draft.end : committedEnd || null;

  const initial = fromISO(start) ?? fromISO(min) ?? new Date();
  const [view, setView] = useState(() => startOfMonth(initial));
  const [focusISO, setFocusISO] = useState(() => toISO(initial));
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(autoFocus);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusISO}"]:not([data-outside])`)?.focus();
  }, [focusISO, view]);

  const fmt = useMemo(
    () => ({
      title: new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" }),
      dow: new Intl.DateTimeFormat(LOCALE, { weekday: "narrow" }),
      dowLong: new Intl.DateTimeFormat(LOCALE, { weekday: "long" }),
      full: new Intl.DateTimeFormat(LOCALE, { dateStyle: "full" }),
    }),
    []
  );
  const todayISO = toISO(new Date());

  function focusDay(iso: string) {
    const d = fromISO(iso);
    if (!d) return;
    const first = view.getFullYear() * 12 + view.getMonth();
    const idx = d.getFullYear() * 12 + d.getMonth();
    if (idx < first) setView(startOfMonth(d));
    else if (idx > first + months - 1) setView(addMonths(startOfMonth(d), -(months - 1)));
    setFocusISO(iso);
    shouldFocus.current = true;
  }

  function pick(iso: string) {
    if (isOutOfBounds(iso, min, max)) return;
    setFocusISO(iso);
    if (props.mode === "range") {
      const next = pickInRange({ start, end: draft ? draft.end : committedEnd || null }, iso);
      setHover(null);
      if (next.end) {
        setDraft(null);
        props.onChange({ start: next.start, end: next.end });
      } else {
        setDraft(next);
      }
      return;
    }
    props.onChange(iso);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, iso: string) {
    const d = fromISO(iso);
    if (!d) return;
    const next = moveByKey(d, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    const nextISO = toISO(next);
    if (isOutOfBounds(nextISO, min, max)) return;
    focusDay(nextISO);
  }

  // Si el día enfocado quedó fuera de los meses visibles (flechas de mes),
  // el primer día habilitado del primer mes visible toma el foco itinerante.
  const firstVisible = view.getFullYear() * 12 + view.getMonth();
  const focusDate = fromISO(focusISO);
  const focusVisible = focusDate && focusDate.getFullYear() * 12 + focusDate.getMonth() - firstVisible >= 0 && focusDate.getFullYear() * 12 + focusDate.getMonth() - firstVisible < months;
  const tabbableISO = focusVisible
    ? focusISO
    : monthGrid(view).map(toISO).find((iso) => iso.slice(0, 7) === toISO(view).slice(0, 7) && !isOutOfBounds(iso, min, max)) ?? focusISO;

  const preview = range && start && !end && hover ? (hover < start ? [hover, start] : [start, hover]) : null;

  return (
    <div className={cn("inline-flex max-w-full flex-wrap gap-4 select-none", className)} ref={gridRef}>
      {Array.from({ length: months }, (_, index) => {
        const monthView = addMonths(view, index);
        const month = monthView.getMonth();
        const days = monthGrid(monthView);
        return (
          <div key={index} className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              {index === 0 ? (
                <button
                  type="button"
                  aria-label="Mes anterior"
                  onClick={() => { setView(addMonths(view, -1)); }}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-light hover:text-foreground"
                >
                  <ChevronLeft size={16} aria-hidden />
                </button>
              ) : <span className="w-8" aria-hidden />}
              <span aria-live="polite" className="text-sm font-semibold">{capitalize(fmt.title.format(monthView))}</span>
              {index === months - 1 ? (
                <button
                  type="button"
                  aria-label="Mes siguiente"
                  onClick={() => { setView(addMonths(view, 1)); }}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-light hover:text-foreground"
                >
                  <ChevronRight size={16} aria-hidden />
                </button>
              ) : <span className="w-8" aria-hidden />}
            </div>
            <div className="grid grid-cols-[repeat(7,2.25rem)] gap-0.5" onPointerLeave={() => setHover(null)}>
              {Array.from({ length: 7 }, (_, i) => {
                const sample = new Date(2023, 0, 2 + i); // 2 ene 2023 fue lunes
                return (
                  <abbr key={i} title={fmt.dowLong.format(sample)} className="grid h-7 place-items-center text-[11px] font-semibold uppercase text-muted no-underline">
                    {fmt.dow.format(sample)}
                  </abbr>
                );
              })}
              {days.map((d) => {
                const iso = toISO(d);
                const outside = d.getMonth() !== month;
                // Con dos meses, los días ajenos quedan en blanco para no duplicarlos.
                if (outside && months > 1) return <span key={iso} aria-hidden />;
                const disabled = isOutOfBounds(iso, min, max);
                const isStart = iso === start;
                const isEnd = iso === end;
                const selected = isStart || isEnd;
                const inRange = range && start && end ? iso > start && iso < end : false;
                const inPreview = preview ? iso > preview[0] && iso < preview[1] : false;
                const tabbable = iso === tabbableISO && !disabled && !outside;
                return (
                  <button
                    key={iso}
                    type="button"
                    data-date={iso}
                    data-outside={outside || undefined}
                    disabled={disabled}
                    tabIndex={tabbable ? 0 : -1}
                    aria-pressed={selected}
                    aria-label={fmt.full.format(d)}
                    aria-current={iso === todayISO ? "date" : undefined}
                    onClick={() => pick(iso)}
                    onKeyDown={(event) => onKeyDown(event, iso)}
                    onFocus={() => setFocusISO(iso)}
                    onPointerEnter={() => { if (range && start && !end) setHover(iso); }}
                    className={cn(
                      "h-9 rounded-lg text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-strong",
                      "disabled:cursor-not-allowed disabled:opacity-35",
                      selected
                        ? "bg-foreground font-semibold text-background"
                        : inRange || inPreview
                          ? "rounded-none bg-surface-light text-foreground"
                          : outside
                            ? "text-muted hover:bg-surface-light"
                            : "text-foreground hover:bg-surface-light",
                      iso === todayISO && !selected && "ring-1 ring-inset ring-border"
                    )}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
