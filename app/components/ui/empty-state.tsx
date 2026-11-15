import React from "react";
import { cn } from "./cn";

// Estado vacío (dirección congelada, nov 2026): sin cuadro de ícono. Ícono
// Lucide de 20 px en --subtle (opcional), titular de 3 a 5 palabras, como
// máximo una línea de cuerpo y un CTA. Dentro de una sección no lleva borde.
interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-10 text-center", className)}>
      {Icon && <Icon size={20} className="text-subtle" aria-hidden />}
      <p className="text-title text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
