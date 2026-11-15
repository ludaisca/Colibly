import React from "react";
import { cn } from "./cn";
import { HelpHint } from "./help-hint";
import type { GlossaryKey } from "@/lib/help/glossary";

// Encabezado de página: 56 px, título a la izquierda y acciones a la derecha
// en la misma línea. `description` solo si es un dato vivo ("3 bots activos ·
// 148 respuestas"), nunca un subtítulo de relleno.
interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Término del glosario: pone un (i) "¿Qué es esto?" junto al título. */
  hint?: GlossaryKey;
  className?: string;
}

export function PageHeader({ title, description, actions, hint, className }: PageHeaderProps) {
  return (
    <div className={cn("flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2", className)}>
      <div className="min-w-0">
        <h1 className="text-page-title text-foreground">
          {title}
          {hint && <HelpHint term={hint} className="ml-1 align-middle" />}
        </h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
