import { Skeleton } from "@/app/components/kit/skeleton";

export default function ContactsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true" aria-label="Cargando contactos">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-8 w-48" /></div>
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    </div>
  );
}
