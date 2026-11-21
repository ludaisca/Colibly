import { Heading } from "@astryxdesign/core/Heading";
import { cn } from "./cn";

// Encabezado de sección (Heading de Astryx, nivel 2): la jerarquía la da la
// tipografía, no una caja. Server-safe.
interface SectionHeaderProps {
  title: string;
  /** @deprecated Ya no se muestra (Andén). */
  eyebrow?: string;
  /** Acción a la derecha (link "Ver todo", botón) — ReactNode, no icono suelto. */
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <Heading level={2}>{title}</Heading>
      </div>
      {action && <div className="shrink-0 pb-0.5">{action}</div>}
    </div>
  );
}
