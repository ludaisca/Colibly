"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { describeTimelineItem, type TimelineItem } from "@/lib/crm/timeline-ui";

const KIND_LABEL: Record<TimelineItem["kind"], string> = { activity: "CRM", message: "Mensaje", note: "Nota", appointment: "Cita" };

// Línea de tiempo unificada de la persona: historial del CRM, mensajes de todos
// sus canales, notas y citas, de más nuevo a más viejo, con "Ver más".
export function PersonTimeline({ personId, refreshKey = 0 }: { personId: string; refreshKey?: number }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (after: string | null) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/crm/people/${personId}/timeline?limit=15${after ? `&cursor=${encodeURIComponent(after)}` : ""}`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: TimelineItem[]; nextCursor: string | null };
        setItems((prev) => (after ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [personId]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial al montar o refrescar
    void load(null);
  }, [load, refreshKey]);

  return (
    <div className="space-y-2">
      <p className="text-eyebrow font-medium uppercase tracking-wider text-muted-darker">Actividad</p>
      {!loading && items.length === 0 && <p className="text-sm text-muted">Todavía no hay actividad.</p>}
      <ol className="space-y-3">
        {items.map((it) => {
          const text = describeTimelineItem(it);
          return (
            <li key={it.key} className="border-l-2 border-border pl-3">
              <p className="text-sm text-foreground">
                {text.title}
                {it.actor?.name && <span className="text-muted-darker"> · {it.actor.name}</span>}
              </p>
              {text.detail && <p className="line-clamp-2 text-xs text-muted">{text.detail}</p>}
              <p className="mt-0.5 text-[11px] text-muted-darker">
                {KIND_LABEL[it.kind]} · {new Date(it.at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </li>
          );
        })}
      </ol>
      {cursor && (
        <Button variant="ghost" size="sm" onClick={() => load(cursor)} loading={loading}>
          Ver más
        </Button>
      )}
    </div>
  );
}
