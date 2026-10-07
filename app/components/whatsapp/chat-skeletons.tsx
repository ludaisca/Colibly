import { Skeleton } from "@/app/components/kit/skeleton";
import { cn } from "@/app/components/kit/utils";

// Fantasma de la lista de conversaciones (mismo ancho que ChatListPanel) —
// fallback del layout de la bandeja mientras llegan la sesión y las cuentas.
export function ChatListSkeleton() {
  return (
    <div className="hidden h-full w-full shrink-0 flex-col overflow-hidden border-r bg-card md:flex md:w-80 xl:w-96" aria-hidden="true">
      <div className="space-y-3 border-b px-4 pb-3 pt-4">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
      <div className="flex-1 space-y-1 overflow-hidden p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg px-2.5 py-2.5">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Burbujas fantasma del hilo mientras carga el historial de un chat ya
// seleccionado. Sin padding ni altura propios: el contenedor del hilo ya los
// pone.
export function ChatBubblesSkeleton({ className }: { className?: string }) {
  const bubbles = [
    { mine: false, w: "w-48" },
    { mine: true, w: "w-40" },
    { mine: false, w: "w-64" },
    { mine: false, w: "w-32" },
    { mine: true, w: "w-56" },
    { mine: true, w: "w-28" },
  ];
  return (
    <div className={cn("flex flex-col justify-end gap-3", className)} aria-hidden="true">
      {bubbles.map((b, i) => (
        <div key={i} className={cn("flex", b.mine ? "justify-end" : "justify-start")}>
          <Skeleton className={cn("h-10", b.w, b.mine ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-tl-md")} />
        </div>
      ))}
    </div>
  );
}
