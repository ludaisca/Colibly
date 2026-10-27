"use client";

import { useState } from "react";
import { cn } from "@/app/components/ui/cn";
import { Reveal } from "./_reveal";

const STEPS = [
  {
    title: "Crea tu cuenta y conecta WhatsApp",
    text: "API oficial de Meta. Cada ejecutivo puede usar su número en el celular y en Colibly a la vez.",
  },
  {
    title: "Enséñale a tu bot tu negocio",
    text: "Precios, servicios y preguntas frecuentes. El bot responde con eso y te pasa la plática cuando hace falta.",
  },
  {
    title: "Atiende y vende desde la bandeja",
    text: "Tu equipo toma lo que el bot no resuelve. El pipeline muestra quién está por comprar.",
  },
] as const;

/** Tres pasos con resalte al foco/hover. Sin autoavance: el usuario manda. */
export function HowSteps() {
  const [active, setActive] = useState(0);

  return (
    <ol className="steps-track relative mt-8 grid gap-4 sm:mt-12 sm:gap-6 md:grid-cols-3 md:gap-8">
      <span
        aria-hidden
        className="pointer-events-none absolute left-[8%] right-[8%] top-5 hidden h-px bg-border md:block"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-[8%] top-5 hidden h-0.5 origin-left rounded-full bg-accent-strong transition-[width] duration-500 ease-out md:block"
        style={{ width: `${(active / (STEPS.length - 1)) * 84}%` }}
      />
      {STEPS.map((step, i) => {
        const on = i === active;
        return (
          <Reveal key={step.title} as="li" className="relative min-w-0" delay={i * 90}>
            <button
              type="button"
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow] duration-300 sm:p-5",
                on
                  ? "border-accent-strong bg-accent-subtle/50 ring-1 ring-accent-strong"
                  : "border-transparent bg-transparent hover:border-border hover:bg-background/80"
              )}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
            >
              <p
                className={cn(
                  "font-display text-3xl font-semibold tabular-nums transition-colors duration-300 sm:text-4xl",
                  on ? "text-accent-ink" : "text-muted"
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 text-pretty font-display text-lg font-semibold tracking-tight sm:text-xl">{step.title}</h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-muted">{step.text}</p>
            </button>
          </Reveal>
        );
      })}
    </ol>
  );
}
