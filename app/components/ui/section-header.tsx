import { cn } from "./cn";

// Encabezado de sección del layout workbench: la jerarquía la da la
// tipografía (text-title), no una caja ni una etiqueta en mayúsculas.
// Server-safe, sin iconos como props.

interface SectionHeaderProps {
  title: string;
  /** @deprecated Ya no se muestra (Andén). */
  eyebrow?: string;
  /** Acción a la derecha (link "Ver todo", botón) — ReactNode, no icono suelto. */
  action?: React.ReactNode;
  className?: string;
}

// Andén (2026-11-07): sin etiqueta sobre el título — Impeccable la prohíbe; el
// título se sostiene solo. `eyebrow` se acepta y se ignora para no tocar 45 llamadas.
export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-title text-foreground">
          {title}
        </h2>
      </div>
      {action && <div className="shrink-0 pb-0.5">{action}</div>}
    </div>
  );
}
