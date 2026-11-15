import { cn } from "./cn";

// Bloque de Configuración (QA-022): título y descripción corta a la izquierda
// (240 px) y los campos a la derecha; filete entre bloques, sin tarjeta. En
// el teléfono, uno sobre otro. Server-safe.
export function SettingsBlock({
  id,
  title,
  description,
  className,
  children,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("grid scroll-mt-4 gap-4 border-t border-border py-6 first:border-t-0 first:pt-0 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8", className)}>
      <div className="min-w-0">
        <h2 className="text-title text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}
