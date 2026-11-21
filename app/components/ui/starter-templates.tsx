"use client";

import { cn } from "./cn";
import { Button } from "./button";

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


export function StarterTemplates({ cards, className }: { cards: StarterCard[]; className?: string }) {
  return (
    <ul className={cn("w-full divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface text-left", className)}>
      {cards.map((card) => (
        <li key={card.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{card.title}</span>
            <span className="block text-xs text-muted">{card.description}</span>
          </span>
          <Button variant="secondary" size="sm" href={card.href} onClick={card.href ? undefined : card.onSelect} aria-label={`Usar ${card.title}`}>
            Usar
          </Button>
        </li>
      ))}
    </ul>
  );
}
