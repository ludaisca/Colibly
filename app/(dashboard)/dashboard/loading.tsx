import { Skeleton } from "@/app/components/ui/skeleton";

// Esqueleto del panel: mismo dibujo que la página (encabezado, frase de
// estado, franja de 5 cifras y dos columnas 1fr / 372 px).
export default function DashboardLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Cargando panel">
      <div className="flex min-h-14 flex-col justify-center gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2 bg-surface px-4 py-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
        <div className="space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
