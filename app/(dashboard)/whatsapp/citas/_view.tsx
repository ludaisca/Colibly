"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RefreshCw, CalendarClock, Plus, X } from "lucide-react";
import { PageHeader } from "@/app/components/ui/page-header";
import { KpiStrip, type KpiItem } from "@/app/components/ui/kpi-strip";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Select } from "@/app/components/ui/select";
import { Spinner } from "@/app/components/ui/spinner";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { SectionHeader } from "@/app/components/ui/section-header";
import { EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { useToast } from "@/app/components/ui/toast";
import { cn } from "@/app/components/ui/cn";
import { AppointmentFormModal, type AppointmentDetail } from "@/app/components/whatsapp/appointment-form-modal";

const STATUS_BADGE: Record<AppointmentDetail["status"], { label: string; tone: "info" | "success" | "neutral" | "danger" }> = {
  SCHEDULED: { label: "Agendada", tone: "info" },
  COMPLETED: { label: "Completada", tone: "success" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
  NO_SHOW: { label: "No se presentó", tone: "danger" },
};

const STATUS_OPTIONS = [
  { value: "", label: "Todos los estados" },
  { value: "SCHEDULED", label: "Agendadas" },
  { value: "COMPLETED", label: "Completadas" },
  { value: "CANCELLED", label: "Canceladas" },
  { value: "NO_SHOW", label: "No se presentó" },
];

const SCOPE_OPTIONS = [
  { value: "all", label: "Todas las fechas" },
  { value: "today", label: "Hoy" },
  { value: "week", label: "Esta semana" },
  { value: "overdue", label: "Vencidas" },
];

function contactLabelOf(c: { name: string | null; realName: string | null; remoteJid: string }): string {
  return c.realName ?? c.name ?? c.remoteJid;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}
function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const day = r.getDay(); // 0 domingo
  const diff = day === 0 ? -6 : 1 - day; // semana inicia lunes
  r.setDate(r.getDate() + diff);
  return r;
}
function endOfWeek(d: Date): Date {
  const r = startOfWeek(d);
  r.setDate(r.getDate() + 6);
  return endOfDay(r);
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function dayLabel(iso: string): string {
  const label = new Date(iso).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function CitasView() {
  const { error: toastError } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const contactIdParam = searchParams.get("contactId");
  const highlightId = searchParams.get("id");

  const [appointments, setAppointments] = useState<AppointmentDetail[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentDetail | null>(null);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const all: AppointmentDetail[] = [];
      let page = 1;
      while (true) {
        const res = await fetch(`/api/whatsapp/appointments?page=${page}`);
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error(data.error ?? "Error al cargar las citas");
        all.push(...data);
        if (data.length < 500) break;
        page++;
      }
      setAppointments(all);
      setNow(new Date());
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar las citas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchAppointments also used for manual refresh
    fetchAppointments();
  }, [fetchAppointments]);

  const kpis: KpiItem[] = useMemo(() => {
    const todayStart = startOfDay(now).getTime();
    const todayEnd = endOfDay(now).getTime();
    const weekStart = startOfWeek(now).getTime();
    const weekEnd = endOfWeek(now).getTime();

    let todayCount = 0, weekCount = 0, overdueCount = 0;
    for (const a of appointments) {
      if (a.status !== "SCHEDULED") continue;
      const t = new Date(a.scheduledAt).getTime();
      if (t >= todayStart && t <= todayEnd) todayCount++;
      if (t >= weekStart && t <= weekEnd) weekCount++;
      if (t < now.getTime()) overdueCount++;
    }
    return [
      { label: "Hoy", value: String(todayCount) },
      { label: "Esta semana", value: String(weekCount) },
      { label: "Vencidas", value: String(overdueCount), hint: overdueCount > 0 ? "requieren atención" : "al día" },
      { label: "Total", value: String(appointments.length), hint: "citas" },
    ];
  }, [appointments, now]);

  const filtered = useMemo(() => {
    const todayStart = startOfDay(now).getTime();
    const todayEnd = endOfDay(now).getTime();
    const weekStart = startOfWeek(now).getTime();
    const weekEnd = endOfWeek(now).getTime();

    return appointments.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (contactIdParam && a.contact.id !== contactIdParam) return false;
      if (scopeFilter === "all") return true;
      const t = new Date(a.scheduledAt).getTime();
      if (scopeFilter === "today") return t >= todayStart && t <= todayEnd;
      if (scopeFilter === "week") return t >= weekStart && t <= weekEnd;
      if (scopeFilter === "overdue") return a.status === "SCHEDULED" && t < now.getTime();
      return true;
    });
  }, [appointments, statusFilter, scopeFilter, contactIdParam, now]);

  const groups = useMemo(() => {
    const map = new Map<string, AppointmentDetail[]>();
    for (const a of filtered) {
      const key = dayKey(a.scheduledAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries()); // ya viene ordenado: la API devuelve scheduledAt asc
  }, [filtered]);

  const contactFilterLabel = contactIdParam
    ? appointments.find((a) => a.contact.id === contactIdParam)?.contact
    : null;

  async function handleQuickComplete(a: AppointmentDetail, status: AppointmentDetail["status"]) {
    try {
      const res = await fetch(`/api/whatsapp/appointments/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      fetchAppointments();
    } catch {
      toastError("Error al actualizar la cita");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Citas"
        description="Agenda de citas por contacto — recordatorios automáticos incluidos."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchAppointments}>
              Actualizar
            </Button>
            <Button size="sm" icon={Plus} onClick={() => { setEditing(null); setModalOpen(true); }}>
              Nueva cita
            </Button>
          </div>
        }
      />

      {!fetchError && <KpiStrip items={kpis} />}

      {!fetchError && <div className="flex flex-wrap items-center gap-3">
        <Select aria-label="Filtrar citas por estado" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Filtrar citas por fecha" value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="w-48">
          {SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        {contactIdParam && (
          <Badge tone="accent" size="md">
            {contactFilterLabel ? contactLabelOf(contactFilterLabel) : "Contacto"}
            <button
              onClick={() => router.push("/whatsapp/citas")}
              className="ml-1 hover:text-foreground"
              aria-label="Quitar filtro de contacto"
            >
              <X size={12} />
            </button>
          </Badge>
        )}
      </div>}

      {fetchError ? (
        <ListErrorState message={fetchError} onRetry={fetchAppointments} />
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Sin citas"
          description="Agenda una cita desde aquí o desde la ficha de un contacto."
          action={<Button size="sm" icon={Plus} onClick={() => { setEditing(null); setModalOpen(true); }}>Nueva cita</Button>}
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([key, rows]) => (
            <div key={key} className="space-y-2">
              <SectionHeader title={dayLabel(rows[0].scheduledAt)} />
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {rows.map((a) => {
                  const badge = STATUS_BADGE[a.status];
                  return (
                    <div
                      key={a.id}
                      onClick={() => { setEditing(a); setModalOpen(true); }}
                      className={cn(
                        "group relative flex flex-col items-stretch gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-surface-light/60 sm:flex-row sm:items-center",
                        a.id === highlightId && "bg-accent-subtle"
                      )}
                    >
                      <EntityRow
                        leading={<EntityAvatar id={a.contact.id} name={contactLabelOf(a.contact)} size="sm" />}
                        title={<button type="button" onClick={(event) => { event.stopPropagation(); setEditing(a); setModalOpen(true); }} className="text-left hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-strong" aria-label={`Editar cita: ${a.title}`}>{a.title}</button>}
                        badges={
                          <span className="flex shrink-0 items-center gap-1">
                            <Badge tone={badge.tone} size="sm">{badge.label}</Badge>
                            {a.source === "AI_BOT" && <Badge tone="accent" size="sm">Propuesta por IA</Badge>}
                          </span>
                        }
                        subtitle={
                          <>
                            {contactLabelOf(a.contact)}
                            {a.assignedTo && <> · {a.assignedTo.name ?? a.assignedTo.email}</>}
                          </>
                        }
                        meta={
                          <span className="tabular-nums">
                            {new Date(a.scheduledAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        }
                      />
                      {a.status === "SCHEDULED" && (
                        <div
                          className="flex shrink-0 items-center justify-end gap-1.5 border-t border-border pt-2 opacity-100 transition-opacity focus-within:opacity-100 sm:border-0 sm:pt-0 md:opacity-0 md:group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="mr-auto text-xs text-muted sm:hidden">
                            {new Date(a.scheduledAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <Button size="sm" variant="secondary" onClick={() => handleQuickComplete(a, "COMPLETED")}>
                            Completada
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => handleQuickComplete(a, "CANCELLED")}>
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <AppointmentFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchAppointments}
        initialData={editing ?? undefined}
      />
    </div>
  );
}
