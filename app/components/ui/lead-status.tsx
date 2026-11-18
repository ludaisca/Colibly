import { cn } from "./cn";
import type { Station } from "@/lib/pipeline/stages";
import type { LeadStatus } from "@prisma/client";

// Estado del lead como estación de la ruta de la venta (Andén, 2026-11-07).
// Antes: azul / ámbar / teal / verde / rojo, que competían con las lámparas de
// espera y con la franja de cuenta. Ahora neutro con los puntos recorridos;
// solo "Cliente" lleva color (éxito) y "Perdido" va apagado, sin puntos.

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  QUALIFIED: "Calificado",
  CUSTOMER: "Cliente",
  LOST: "Perdido",
};

/** Puntos de la ruta: llenos hasta la estación actual. Decorativo (aria-hidden). */
export function StationMark({ station, className }: { station: Station; className?: string }) {
  if (station.tone === "lost") return null;
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center gap-[3px]", className)}>
      {Array.from({ length: station.total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < station.step ? (station.tone === "won" ? "bg-success" : "bg-foreground") : "bg-border"
          )}
        />
      ))}
    </span>
  );
}
