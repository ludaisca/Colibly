import { PageHeader } from "@/app/components/ui/page-header";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Ayuda" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-lg border border-border bg-surface" />
      ))}
    </div>
  );
}
