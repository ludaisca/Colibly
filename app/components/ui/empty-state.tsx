import React from "react";
import { EmptyState as AxEmptyState } from "@astryxdesign/core/EmptyState";

// Adaptador (rediseño con Astryx): EmptyState de Astryx. Server-safe: el
// ícono se dibuja aquí y viaja como elemento, no como función.
// Regla de siempre: titular de 3 a 5 palabras, una línea de cuerpo, un CTA.
interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={className}>
      <AxEmptyState
        title={title}
        description={description}
        icon={Icon ? <Icon size={20} className="text-subtle" aria-hidden /> : undefined}
        actions={action}
      />
    </div>
  );
}
