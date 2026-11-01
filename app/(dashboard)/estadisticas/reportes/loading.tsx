import { PageHeader } from "@/app/components/ui/page-header";
import { Skeleton } from "@/app/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reportes" description="Actividad, tiempos de respuesta y carga por agente en un periodo." />
      <Skeleton className="h-20 rounded-lg" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-lg lg:col-span-2" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </div>
  );
}
