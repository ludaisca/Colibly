import React from "react";
import { cn } from "./cn";

interface PageHeaderProps {
  /** Etiqueta pequeña uppercase sobre el título (sección o contexto). */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4", className)}>
      <div>
        {eyebrow && <p className="mb-1 text-eyebrow font-medium uppercase tracking-wider text-muted-darker">{eyebrow}</p>}
        <h1 className="font-display text-page-title font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
