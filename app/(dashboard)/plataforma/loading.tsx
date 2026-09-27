import { PageHeader } from "@/app/components/ui/page-header";
import { Skeleton, SkeletonRow } from "@/app/components/ui/skeleton";

export default function PlatformLoading() {
  return (
    <div className="space-y-8">
      <PageHeader title="Plataforma" description="Todas las organizaciones de SunflowCRM, su cobro y acciones de soporte." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-10 w-full max-w-md" />
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonRow key={i} cols={5} />
        ))}
      </div>
    </div>
  );
}
