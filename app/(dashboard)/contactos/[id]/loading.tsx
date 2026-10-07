import { Skeleton } from "@/app/components/kit/skeleton";

export default function ContactLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true" aria-label="Cargando contacto">
      <div className="flex items-start gap-4">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2"><Skeleton className="h-7 w-64" /><Skeleton className="h-4 w-40" /></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-4"><Skeleton className="h-72 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>
        <Skeleton className="h-[28rem] w-full rounded-2xl" />
      </div>
    </div>
  );
}
