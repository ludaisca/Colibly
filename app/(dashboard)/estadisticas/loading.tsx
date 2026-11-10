import { PageHeader } from "@/app/components/ui/page-header";
import { Skeleton, SkeletonRow } from "@/app/components/ui/skeleton";

export default function EstadisticasLoading() {
  return (
    <div className="space-y-10">
      <PageHeader title="Estadísticas" description="Cómo va tu negocio: chats, respuestas, campañas y equipo." />

      {/* Franja KPI */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-10">
          {/* Mensajes diarios */}
          <div className="space-y-3">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>

          {/* Tablas */}
          {Array.from({ length: 2 }).map((_, t) => (
            <div key={t} className="space-y-3">
              <Skeleton className="h-6 w-52" />
              <div className="divide-y divide-border">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonRow key={i} cols={4} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-10">
          {/* Inversión en IA */}
          <div className="space-y-3">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>

          {/* Chats calificados (dona) */}
          <div className="space-y-3">
            <Skeleton className="h-6 w-36" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-28 w-28 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-full" />
                ))}
              </div>
            </div>
          </div>

          {/* Entregas por origen / Chats por número */}
          {Array.from({ length: 2 }).map((_, s) => (
            <div key={s} className="space-y-3">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
