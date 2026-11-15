"use client";

import Link from "next/link";
import { cn } from "./cn";

// Plantillas de partida en los estados vacíos (Bots, Automatizaciones,
// Monitores, Secuencias) como filas con "Usar" (dirección congelada): cada
// una abre el formulario con esos valores o va a un enlace.
export interface StarterCard {
  id: string;
  title: string;
  description: string;
  onSelect?: () => void;
  href?: string;
}

const USE = "shrink-0 inline-flex h-7 items-center rounded-sm border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors duration-fast hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong";

export function StarterTemplates({ cards, className }: { cards: StarterCard[]; className?: string }) {
  return (
    <ul className={cn("w-full divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface text-left", className)}>
      {cards.map((card) => (
        <li key={card.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{card.title}</span>
            <span className="block text-xs text-muted">{card.description}</span>
          </span>
          {card.href ? (
            <Link href={card.href} className={USE} aria-label={`Usar ${card.title}`}>Usar</Link>
          ) : (
            <button type="button" onClick={card.onSelect} className={USE} aria-label={`Usar ${card.title}`}>Usar</button>
          )}
        </li>
      ))}
    </ul>
  );
}
