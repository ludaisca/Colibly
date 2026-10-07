"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, CalendarClock, CheckSquare, Loader2, MessageSquare, StickyNote, UserRound, type LucideIcon } from "lucide-react";
import { Button } from "@/app/components/kit/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/app/components/kit/empty";
import { Skeleton } from "@/app/components/kit/skeleton";
import { Tabs, TabsList, TabsTab } from "@/app/components/kit/tabs";
import { cn } from "@/app/components/kit/utils";
import { describeTimelineItem, type TimelineItem } from "@/lib/crm/timeline-ui";

// Línea de tiempo unificada de una persona: lo que registró el CRM, los
// mensajes de todos sus canales, las notas y las citas ya ocurridas, de más
// nuevo a más viejo y agrupado por día. Se pagina con el cursor del servidor.

type Filter = "all" | "message" | "note" | "activity" | "appointment";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todo" },
  { value: "message", label: "Mensajes" },
  { value: "note", label: "Notas" },
  { value: "activity", label: "Cambios" },
  { value: "appointment", label: "Citas" },
];

const TONES = {
  info: "bg-info-bg text-info",
  accent: "bg-accent-subtle text-accent-ink",
  warning: "bg-warning-bg text-warning",
  success: "bg-success-bg text-success",
  muted: "bg-surface-light text-muted-foreground",
} as const;

function iconFor(item: TimelineItem): { Icon: LucideIcon; tone: keyof typeof TONES } {
  if (item.kind === "message") return { Icon: MessageSquare, tone: item.type === "message.inbound" ? "info" : "accent" };
  if (item.kind === "note") return { Icon: StickyNote, tone: "warning" };
  if (item.kind === "appointment") return { Icon: CalendarClock, tone: item.type.endsWith("completed") ? "success" : "muted" };
  if (item.type.startsWith("deal.")) return { Icon: Briefcase, tone: item.type === "deal.stage_changed" ? "accent" : "muted" };
  if (item.type.startsWith("task.")) return { Icon: CheckSquare, tone: item.type === "task.completed" ? "success" : "muted" };
  return { Icon: UserRound, tone: "muted" };
}

function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

export function Timeline({ personId, refreshKey = 0, compact = false }: { personId: string; refreshKey?: number; compact?: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (after: string | null) => {
      setLoading(true);
      setError(false);
      try {
        const kinds = filter === "all" ? "" : `&kinds=${filter}`;
        const res = await fetch(`/api/crm/people/${personId}/timeline?limit=20${kinds}${after ? `&cursor=${encodeURIComponent(after)}` : ""}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { items: TimelineItem[]; nextCursor: string | null };
        setItems((prev) => (after ? [...prev, ...data.items.filter((n) => !prev.some((p) => p.key === n.key))] : data.items));
        setCursor(data.nextCursor);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [personId, filter]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial y al cambiar de filtro o refrescar
    void load(null);
  }, [load, refreshKey]);

  const groups = useMemo(() => {
    const out: Array<{ label: string; items: TimelineItem[] }> = [];
    for (const it of items) {
      const label = dayLabel(it.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(it);
      else out.push({ label, items: [it] });
    }
    return out;
  }, [items]);

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className={compact ? "w-full" : undefined}>
          {FILTERS.map((f) => (
            <TabsTab key={f.value} value={f.value} className="px-2.5 text-xs">{f.label}</TabsTab>
          ))}
        </TabsList>
      </Tabs>

      {loading && items.length === 0 ? (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando actividad">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3"><Skeleton className="size-7 shrink-0 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader><EmptyTitle>No se pudo cargar la actividad</EmptyTitle><EmptyDescription>Revisa tu conexión e inténtalo de nuevo.</EmptyDescription></EmptyHeader>
          <Button size="sm" variant="outline" onClick={() => load(null)}>Reintentar</Button>
        </Empty>
      ) : groups.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
            <EmptyTitle>Sin actividad todavía</EmptyTitle>
            <EmptyDescription>{filter === "all" ? "Aquí aparecerán los mensajes, notas, cambios y citas de este contacto." : "No hay elementos de este tipo."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.label}>
              <h3 suppressHydrationWarning className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
              <ol className="relative space-y-4">
                {group.items.map((it, i) => {
                  const { Icon, tone } = iconFor(it);
                  const text = describeTimelineItem(it);
                  const isMessage = it.kind === "message";
                  return (
                    <li key={it.key} className="relative flex gap-3">
                      {i < group.items.length - 1 && <span aria-hidden="true" className="absolute left-3.5 top-8 -bottom-4 w-px -translate-x-1/2 bg-border" />}
                      <span className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full", TONES[tone])}>
                        <Icon size={14} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1 pb-0.5">
                        <p className="text-sm text-foreground">
                          <span className="font-medium">{text.title}</span>
                          {it.actor?.name && <span className="text-muted-foreground"> · {it.actor.name}</span>}
                        </p>
                        <p suppressHydrationWarning className="text-xs text-muted-foreground">{timeLabel(it.at)}</p>
                        {text.detail && (
                          isMessage || it.kind === "note" ? (
                            <p className={cn("mt-1.5 whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm", it.type === "message.outbound" ? "bg-accent-muted text-foreground" : "border bg-card text-foreground")}>{text.detail}</p>
                          ) : (
                            <p className="mt-0.5 text-xs text-muted-foreground">{text.detail}</p>
                          )
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {cursor && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => load(cursor)} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : "Ver más"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
