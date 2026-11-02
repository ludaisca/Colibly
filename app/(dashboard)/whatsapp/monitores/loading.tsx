import { PageHeader } from "@/app/components/ui/page-header";
import { SkeletonRow } from "@/app/components/ui/skeleton";

export default function MonitoresLoading() {
  return (
    <div className="space-y-5">
      <PageHeader title="Monitores de temas" description="La IA revisa tus conversaciones cada hora y te avisa en cuáles aparece cada tema." />
      <div className="divide-y divide-border rounded-xl border border-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonRow key={i} cols={3} />
        ))}
      </div>
    </div>
  );
}
