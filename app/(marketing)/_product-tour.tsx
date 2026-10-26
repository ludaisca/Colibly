"use client";

import { useEffect, useState } from "react";
import { cn } from "@/app/components/ui/cn";
import { AutomationMock, InboxMock, PipelineMock } from "./_product-mock";

const VIEWS = [
  {
    id: "bandeja",
    label: "Bandeja",
    caption: "Todos los canales en un solo hilo de trabajo",
    Mock: InboxMock,
  },
  {
    id: "pipeline",
    label: "Pipeline",
    caption: "Leads en movimiento hasta el cierre",
    Mock: PipelineMock,
  },
  {
    id: "auto",
    label: "Automatizaciones",
    caption: "Flujos que responden y pasan a humano",
    Mock: AutomationMock,
  },
] as const;

const INTERVAL_MS = 5500;

/** Carrusel corto de vistas del producto — debajo del hero. */
export function ProductTour({ className }: { className?: string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % VIEWS.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  const current = VIEWS[active] ?? VIEWS[0];

  return (
    <section
      className={cn("scroll-mt-20 border-b border-border/50", className)}
      aria-roledescription="carrusel"
      aria-label="Vistas del producto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12 md:px-6 md:py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 max-w-xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Así se ve por dentro
            </h2>
            <p className="mt-2 text-pretty text-sm text-muted sm:text-base" aria-live="polite">
              {current.caption}
            </p>
          </div>

          <div
            className="flex gap-1 rounded-xl border border-border bg-surface p-1"
            role="tablist"
            aria-label="Vista del producto"
          >
            {VIEWS.map((view, i) => (
              <button
                key={view.id}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={cn(
                  "min-h-10 flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:flex-none sm:px-4 sm:text-sm",
                  i === active
                    ? "bg-accent-subtle text-accent-ink"
                    : "text-muted hover:text-foreground"
                )}
                onClick={() => setActive(i)}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-6 sm:mt-8">
          {VIEWS.map((view, i) => {
            const Mock = view.Mock;
            const on = i === active;
            return (
              <div
                key={view.id}
                role="tabpanel"
                aria-hidden={!on}
                className={cn(
                  "transition-[opacity,transform] duration-300 ease-out",
                  on
                    ? "relative opacity-100"
                    : "pointer-events-none absolute inset-0 translate-y-2 opacity-0"
                )}
              >
                {/* Montamos las 3 para que el cambio sea instantáneo; oculta las inactivas. */}
                <Mock className="w-full min-w-0" />
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2" aria-hidden>
          {VIEWS.map((view, i) => (
            <button
              key={view.id}
              type="button"
              aria-label={view.label}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === active ? "w-6 bg-accent-strong" : "w-1.5 bg-border hover:bg-muted"
              )}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
