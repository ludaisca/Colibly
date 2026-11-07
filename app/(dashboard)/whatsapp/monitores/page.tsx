"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Radar } from "lucide-react";
import { PageHeader } from "@/app/components/ui/page-header";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { Switch } from "@/app/components/ui/switch";
import { SectionHeader } from "@/app/components/ui/section-header";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { SkeletonRow } from "@/app/components/ui/skeleton";
import { RelativeTime } from "@/app/components/ui/relative-time";
import { useToast } from "@/app/components/ui/toast";
import { MonitorFormModal, type MonitorData } from "./_form";

interface MatchData {
  id: string;
  monitorId: string;
  monitorName: string;
  chatName: string | null;
  href: string | null;
  quote: string;
  createdAt: string;
}

// Monitores de temas con IA (F2). Solo admin (nav + proxy.ts + API).
export default function MonitoresPage() {
  const { success, error: toastError } = useToast();
  const [monitors, setMonitors] = useState<MonitorData[]>([]);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [planIncluded, setPlanIncluded] = useState(true);
  const [max, setMax] = useState(10);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MonitorData | "new" | null>(null);
  const [deleting, setDeleting] = useState<MonitorData | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [monitorsRes, matchesRes] = await Promise.all([fetch("/api/monitors"), fetch("/api/monitors/coincidencias")]);
      const monitorsData = await monitorsRes.json();
      const matchesData = await matchesRes.json();
      if (!monitorsRes.ok) throw new Error(monitorsData.error ?? "No se pudieron cargar los monitores");
      setMonitors(monitorsData.monitors);
      setPlanIncluded(monitorsData.planIncluded);
      setMax(monitorsData.max);
      setMatches(Array.isArray(matchesData) ? matchesData : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudieron cargar los monitores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el setState ocurre tras el fetch
    void load();
  }, [load]);

  async function toggle(monitor: MonitorData, active: boolean) {
    setMonitors((prev) => prev.map((m) => (m.id === monitor.id ? { ...m, active } : m)));
    const res = await fetch(`/api/monitors/${monitor.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
    if (!res.ok) {
      setMonitors((prev) => prev.map((m) => (m.id === monitor.id ? { ...m, active: !active } : m)));
      toastError("No se pudo cambiar el monitor");
    }
  }

  async function remove(monitor: MonitorData) {
    const res = await fetch(`/api/monitors/${monitor.id}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) return toastError("No se pudo borrar el monitor");
    success("Monitor borrado");
    void load();
  }

  const visibleMatches = filter ? matches.filter((m) => m.monitorId === filter) : matches;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Monitores de temas"
        description="La IA revisa tus conversaciones cada hora y te muestra en cuáles aparece cada tema: quejas, preguntas por un producto, intención de cancelar…"
        actions={
          <Button icon={Plus} onClick={() => setEditing("new")} disabled={!planIncluded || monitors.length >= max}>
            Nuevo monitor
          </Button>
        }
      />

      {!planIncluded && (
        <Banner tone="info">
          Los monitores de temas están en el plan Pro. <a href="/configuracion/plan" className="font-medium underline underline-offset-2">Ver planes</a>
        </Banner>
      )}

      {loading ? (
        <div className="divide-y divide-border rounded-xl border border-border">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={3} />)}
        </div>
      ) : loadError ? (
        <ListErrorState message={loadError} onRetry={() => void load()} />
      ) : monitors.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="Sin monitores"
          description="Crea uno describiendo un tema. Cada conversación revisada usa 1 crédito de IA."
          action={planIncluded ? <Button size="sm" icon={Plus} onClick={() => setEditing("new")}>Nuevo monitor</Button> : undefined}
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {monitors.map((monitor) => (
              <Card key={monitor.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{monitor.name}</p>
                    <p className="line-clamp-2 text-xs text-muted">{monitor.description}</p>
                  </div>
                  <Switch checked={monitor.active} onCheckedChange={(on) => void toggle(monitor, on)} label={`Activar ${monitor.name}`} />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFilter(filter === monitor.id ? null : monitor.id)}
                    className="text-xs text-accent-ink hover:underline"
                  >
                    <Badge tone={monitor.matchCount ? "accent" : "neutral"} size="sm">{monitor.matchCount} conversaciones</Badge>
                  </button>
                  <span className="ml-auto flex gap-1">
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(monitor)}>Editar</Button>
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDeleting(monitor)} className="text-danger">Borrar</Button>
                  </span>
                </div>
              </Card>
            ))}
          </div>

          <Card className="space-y-3 p-4">
            <SectionHeader
              eyebrow="Hallazgos"
              title={filter ? `Conversaciones: ${monitors.find((m) => m.id === filter)?.name ?? ""}` : "Conversaciones recientes"}
              action={filter ? <Button variant="ghost" size="sm" onClick={() => setFilter(null)}>Ver todas</Button> : undefined}
            />
            {visibleMatches.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-darker">Todavía no hay coincidencias. La revisión corre cada hora.</p>
            ) : (
              <ul className="divide-y divide-border">
                {visibleMatches.map((match) => (
                  <li key={match.id} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{match.chatName ?? "Chat borrado"}</span>
                        <span className="text-muted-darker"> · {match.monitorName}</span>
                      </p>
                      <p className="mt-0.5 text-xs italic text-muted">“{match.quote}”</p>
                    </div>
                    <RelativeTime value={match.createdAt} className="shrink-0 text-micro text-muted-darker" />
                    {match.href && (
                      <Link href={match.href} className="shrink-0 text-xs font-semibold text-accent-ink hover:underline">Abrir chat</Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {editing && (
        <MonitorFormModal
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            success("Monitor guardado");
            void load();
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) return remove(deleting); }}
        title={`¿Borrar “${deleting?.name ?? ""}”?`}
        description="Se borran también sus coincidencias guardadas."
        confirmLabel="Borrar"
        tone="danger"
      />
    </div>
  );
}
