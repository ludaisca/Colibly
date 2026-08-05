import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/app/components/ui/cn";

// Filas fantasma para el riel de conversaciones (mismo ancho que
// ChatWorkspace: w-80 lg:w-96, border-r) — usado en los loading.tsx de las
// rutas de chat mientras no hay nada montado todavía.
export function ChatListSkeleton() {
  return (
    <div className="hidden md:flex flex-col w-full md:w-80 lg:w-96 border-r border-border shrink-0 h-full overflow-hidden">
      <div className="p-3 border-b border-border">
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
      <div className="flex-1 divide-y divide-border overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Burbujas fantasma para el panel de conversación — alterna ancho/alineación
// para imitar MessageBubble. Usado tanto en los loading.tsx de rutas de chat
// como dentro de ChatWorkspace mientras carga el historial de un chat ya
// seleccionado (reemplaza el <Spinner/> genérico anterior). Sin padding/altura
// propios a propósito — cada contexto ya tiene su propio contenedor
// (px-4 py-4 en ChatWorkspace, flex-1 p-4 en los loading.tsx de ruta).
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
          <Skeleton
            className={cn(
              "h-10",
              b.w,
              b.mine ? "rounded-2xl rounded-tr-sm" : "rounded-2xl rounded-tl-sm"
            )}
          />
        </div>
      ))}
    </div>
  );
}
