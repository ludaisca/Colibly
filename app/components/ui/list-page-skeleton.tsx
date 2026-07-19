import { PageHeader } from "./page-header";
import { Skeleton } from "./skeleton";
import { cn } from "./cn";

// Esqueleto reutilizable para páginas con el patrón PageHeader + barra de
// filtros + EntityList (Contactos, Cuentas, Bots, Plantillas, Usuarios,
// Campañas). El título/descripción se muestran reales (ya se conocen antes
// de cargar datos) — solo la barra de filtros y las filas son shimmer.
export function ListPageSkeleton({
  title,
  description,
  rows = 6,
  className,
}: {
  title: string;
  description?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      <PageHeader title={title} description={description} />

      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-full sm:w-64" />
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="h-10 w-10 rounded-bubble shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="hidden sm:block h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
