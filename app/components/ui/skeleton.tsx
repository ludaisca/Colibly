import { Skeleton as AxSkeleton } from "@astryxdesign/core/Skeleton";
import { cn } from "./cn";

// Adaptador (rediseño con Astryx): el bloque de carga es el Skeleton de
// Astryx; el contenedor conserva las medidas que cada pantalla da por clase.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-md", className)} aria-hidden="true">
      <AxSkeleton />
    </div>
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 && lines > 1 ? "w-3/4" : "w-full")} />
      ))}
    </div>
  );
}

export function SkeletonRow({ cols = 4, className }: { cols?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 py-3", className)} aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4 flex-1", i === 0 && "max-w-[120px]")} />
      ))}
    </div>
  );
}
