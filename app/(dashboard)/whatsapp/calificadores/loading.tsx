import { PageHeader } from "@/app/components/ui/page-header";
import { Skeleton, SkeletonRow } from "@/app/components/ui/skeleton";

export default function CalificadoresLoading() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Calificadores de Leads"
        description="Crea agentes de IA que analizan una conversación y la califican con tu propio criterio — cada uno con sus propias instrucciones, para el negocio que vendas."
      />

      <div className="flex gap-1 border-b border-border">
        <Skeleton className="h-9 w-32 mb-[-1px]" />
        <Skeleton className="h-9 w-40 mb-[-1px]" />
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} cols={5} />
        ))}
      </div>
    </div>
  );
}
