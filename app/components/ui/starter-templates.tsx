"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "./cn";

// Tarjetas de plantillas para los estados vacíos (Bots, Automatizaciones,
// Monitores, Secuencias): enseñan para qué sirve la pantalla con 2–3 puntos
// de partida. Cada tarjeta abre el formulario con esos valores o va a un enlace.
export interface StarterCard {
  id: string;
  title: string;
  description: string;
  onSelect?: () => void;
  href?: string;
}

export function StarterTemplates({ cards, className }: { cards: StarterCard[]; className?: string }) {
  return (
    <div className={cn("mx-auto grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3", className)}>
      {cards.map((card) => {
        const body = (
          <>
            <span className="block text-sm font-semibold text-foreground">{card.title}</span>
            <span className="mt-1 block text-xs text-muted">{card.description}</span>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent-ink">
              Usar plantilla <ArrowRight size={12} aria-hidden />
            </span>
          </>
        );
        const cls = "block h-full w-full rounded-lg text-left border border-border bg-surface p-4 transition-colors hover:border-accent-strong hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong";
        return card.href ? (
          <Link key={card.id} href={card.href} className={cls}>{body}</Link>
        ) : (
          <button key={card.id} type="button" onClick={card.onSelect} className={cls}>{body}</button>
        );
      })}
    </div>
  );
}
