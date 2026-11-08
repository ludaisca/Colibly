"use client";

import { usePoll } from "@/app/components/ui/use-poll";
import { useCallback, useState } from "react";
import { Card } from "@/app/components/ui/card";
import { KpiStrip, type KpiItem } from "@/app/components/ui/kpi-strip";
import { formatRelative } from "@/lib/format/dates";
import { AVAILABILITY_LABEL, type Availability } from "@/lib/users/availability-rules";
import type { LiveSnapshot } from "@/lib/estadisticas/live";
import { plural } from "@/lib/format/plural";

const REFRESH_MS = 30_000;

const DOT: Record<Availability, string> = {
  ONLINE: "bg-success",
  BUSY: "bg-warning",
  OFFLINE: "bg-muted-darker",
};

// Panel "Ahora" (benchmark #10): GET /api/estadisticas/en-vivo cada 30 s,
// solo con la pestaña visible (mismo patrón que los contadores de la bandeja).
export function LivePanel() {
  const [data, setData] = useState<LiveSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/estadisticas/en-vivo", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  usePoll(load, { intervalMs: REFRESH_MS });

  const now = data ? Date.parse(data.at) : 0;
  const kpis: KpiItem[] = data
    ? [
        { label: "Abiertos", value: String(data.open), hint: plural(data.pending, "pendiente") },
        { label: "Sin asignar", value: String(data.unassigned) },
        {
          label: "Esperando respuesta",
          value: String(data.awaiting),
          hint: data.oldestWaitingSince ? `el más antiguo ${formatRelative(data.oldestWaitingSince, new Date(now))}` : "nadie espera",
        },
        ...(data.slaBreached !== null
          ? [{ label: "Fuera de SLA", value: String(data.slaBreached), href: "/whatsapp/chat?sla=1", hint: data.slaBreached ? "ver en la bandeja" : "todo a tiempo" }]
          : []),
        {
          label: "Equipo en línea",
          value: `${data.agents.filter((agent) => agent.availability === "ONLINE").length}/${data.agents.length}`,
          hint: plural(data.agents.filter((agent) => agent.availability === "BUSY").length, "ocupado"),
        },
      ]
    : [];

  return (
    <Card className="space-y-4 p-4" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-success animate-pulse-live" aria-hidden />
        <h2 className="font-display text-base font-semibold tracking-tight text-foreground">Ahora</h2>
        <span className="text-xs text-muted-darker">
          {failed ? "No se pudo actualizar; se reintenta en 30 s" : "Se actualiza cada 30 s"}
        </span>
      </div>
      {data ? (
        <>
          <KpiStrip items={kpis} />
          {data.agents.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Disponibilidad del equipo">
              {data.agents.map((agent) => (
                <li
                  key={agent.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs"
                  title={AVAILABILITY_LABEL[agent.availability]}
                >
                  <span className={`h-2 w-2 rounded-full ${DOT[agent.availability]}`} aria-hidden />
                  <span className="font-medium text-foreground">{agent.name}</span>
                  <span className="sr-only">{AVAILABILITY_LABEL[agent.availability]}</span>
                  <span className="tabular-nums text-muted-darker">{plural(agent.openChats, "abierto")}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        !failed && <div className="h-24 animate-pulse rounded-lg bg-surface-light" />
      )}
    </Card>
  );
}
