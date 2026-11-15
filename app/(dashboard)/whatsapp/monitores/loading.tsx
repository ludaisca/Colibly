import { PageHeader } from "@/app/components/ui/page-header";
import { SkeletonRow } from "@/app/components/ui/skeleton";

export default function MonitoresLoading() {
  return (
    <div className="space-y-5">
      <PageHeader title="Monitores IA" />
      <div className="divide-y divide-border rounded-lg border border-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonRow key={i} cols={3} />
        ))}
      </div>
    </div>
  );
}
