"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, MessageSquare, Plus } from "lucide-react";
import { PageHeader } from "@/app/components/ui/page-header";
import { Card, CardAction, CardHeader, CardTitle, CardDescription, CardPanel } from "@/app/components/kit/card";
import { Badge } from "@/app/components/kit/badge";
import { Button } from "@/app/components/kit/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/app/components/kit/empty";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/app/components/kit/select";
import { TaskRow } from "@/app/components/crm/task-row";
import { TaskFormModal } from "@/app/components/crm/task-form-modal";
import type { MyDay } from "@/lib/crm/my-day-types";
import type { TaskItem } from "@/lib/crm/task-ui";

function waiting(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
const dayTime = (iso: string) => new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

// Tarjeta de cifra: etiqueta, número protagonista y una línea de apoyo.
function Stat({ label, value, hint, href, tone }: { label: string; value: number; hint?: string; href?: string; tone?: "danger" }) {
  const body = (
    <Card className="h-full transition-shadow hover:shadow-md/5">
      <CardPanel className="space-y-2 p-4">
        <p className="text-eyebrow font-medium uppercase tracking-wider text-muted-darker">{label}</p>
        <p className={`font-display text-3xl font-semibold tabular-nums tracking-tight ${tone === "danger" && value > 0 ? "text-danger" : "text-foreground"}`}>{value}</p>
        {hint && <p className="text-xs text-muted-darker">{hint}</p>}
      </CardPanel>
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function MiDiaView({ day, ownDay, canSwitch, role }: { day: MyDay; ownDay: boolean; canSwitch: boolean; role: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState<{ personId?: string; dealId?: string; label?: string } | null>(null);
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [team, setTeam] = useState<Array<{ id: string; name: string | null; email: string }>>([]);

  useEffect(() => {
    if (!canSwitch) return;
    fetch("/api/crm/team")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setTeam(d.items ?? []))
      .catch(() => undefined);
  }, [canSwitch]);

  const refresh = () => router.refresh();
  const { counts, tasks, appointments, chats, dealsWithoutNextStep } = day;
  const nothing = !tasks.overdue.length && !tasks.today.length && !tasks.upcoming.length && !tasks.undated.length;
  const teamLabel = (id: string) => {
    const u = team.find((t) => t.id === id);
    return u ? u.name ?? u.email : "…";
  };

  const taskCard = (title: string, rows: TaskItem[], tone?: "danger") =>
    rows.length > 0 && (
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardAction>
            <Badge variant={tone === "danger" ? "error" : "outline"}>{rows.length}</Badge>
          </CardAction>
        </CardHeader>
        <CardPanel className="divide-y divide-border py-1">
          {rows.map((t) => <TaskRow key={t.id} task={t} onChanged={refresh} onEdit={setEditing} />)}
        </CardPanel>
      </Card>
    );

  const sideCard = (title: string, children: React.ReactNode, description?: string) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardPanel className="space-y-1 pt-0">{children}</CardPanel>
    </Card>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Espacio de trabajo"
        title={ownDay ? "Mi día" : "Día de un compañero"}
        description={new Date(day.now).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: day.timezone })}
        actions={
          <>
            {canSwitch && team.length > 0 && (
              <Select value={day.userId} onValueChange={(v) => v && router.push(`/mi-dia?userId=${v}`)}>
                <SelectTrigger aria-label="Ver el día de" className="w-48">
                  <SelectValue>{teamLabel(day.userId)}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name ?? u.email}</SelectItem>)}
                </SelectPopup>
              </Select>
            )}
            <Button onClick={() => setCreating({})}><Plus />Nueva tarea</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Tareas atrasadas" value={counts.tasksOverdue} hint="por resolver" tone="danger" />
        <Stat label="Tareas de hoy" value={counts.tasksToday} />
        <Stat label="Citas de hoy" value={counts.appointmentsToday} href="/whatsapp/citas" />
        <Stat label="Chats sin responder" value={counts.chatsWaiting} href="/whatsapp/chat" />
        <Stat label="Sin siguiente paso" value={counts.dealsWithoutNextStep} hint="negocios abiertos" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {nothing ? (
            <Card>
              <CardPanel>
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><CalendarClock /></EmptyMedia>
                    <EmptyTitle>Sin tareas pendientes</EmptyTitle>
                    <EmptyDescription>Crea una tarea para no perder el seguimiento de un contacto.</EmptyDescription>
                  </EmptyHeader>
                  <Button onClick={() => setCreating({})}><Plus />Nueva tarea</Button>
                </Empty>
              </CardPanel>
            </Card>
          ) : (
            <>
              {taskCard("Atrasadas", tasks.overdue, "danger")}
              {taskCard("Hoy", tasks.today)}
              {taskCard("Próximos 7 días", tasks.upcoming)}
              {taskCard("Sin fecha", tasks.undated)}
            </>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {sideCard(
            "Citas",
            <>
              {appointments.today.length === 0 && appointments.pendingClose.length === 0 && <p className="text-sm text-muted">Sin citas hoy.</p>}
              {appointments.today.map((a) => (
                <Link key={a.id} href={`/whatsapp/citas?id=${a.id}`} className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-light">
                  <span className="font-medium tabular-nums text-foreground" suppressHydrationWarning>{time(a.scheduledAt)}</span>
                  <span className="min-w-0 flex-1 truncate">{a.title}<span className="text-muted-darker"> · {a.contactName}</span></span>
                </Link>
              ))}
              {appointments.pendingClose.length > 0 && (
                <div className="space-y-1 pt-2">
                  <p className="px-2 text-xs font-medium text-warning">Por cerrar (días anteriores)</p>
                  {appointments.pendingClose.map((a) => (
                    <Link key={a.id} href={`/whatsapp/citas?id=${a.id}`} className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-light">
                      <span className="tabular-nums text-muted" suppressHydrationWarning>{dayTime(a.scheduledAt)}</span>
                      <span className="min-w-0 flex-1 truncate">{a.title}<span className="text-muted-darker"> · {a.contactName}</span></span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {sideCard(
            "Chats sin responder",
            <>
              {chats.length === 0 && <p className="text-sm text-muted">Estás al día con tus conversaciones.</p>}
              {chats.map((c) => (
                <Link key={`${c.channel}-${c.id}`} href={`/whatsapp/chat/${c.accountId}/${c.id}`} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-light">
                  <MessageSquare size={14} className="mt-1 shrink-0 text-muted-darker" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name ?? "Sin nombre"}</span>
                    <span className="block truncate text-xs text-muted">{c.lastMessage}</span>
                  </span>
                  <Badge variant={c.waitingMinutes !== null && c.waitingMinutes > 240 ? "warning" : "outline"}>{waiting(c.waitingMinutes)}</Badge>
                </Link>
              ))}
            </>
          )}

          {sideCard(
            "Negocios sin siguiente paso",
            <>
              {dealsWithoutNextStep.length === 0 && <p className="text-sm text-muted">Todos tus negocios abiertos tienen una tarea o cita pendiente.</p>}
              {dealsWithoutNextStep.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{d.title}</span>
                    <span className="block truncate text-xs text-muted">{d.person.name} · {d.stage.name}</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setCreating({ personId: d.person.id, dealId: d.id, label: d.person.name })}>Tarea</Button>
                </div>
              ))}
              {role !== "ejecutivo" && dealsWithoutNextStep.length > 0 && <Link href="/ventas" className="block px-2 pt-1 text-xs text-accent-ink hover:underline">Ir al pipeline</Link>}
            </>
          )}
        </div>
      </div>

      {creating && <TaskFormModal open onClose={() => setCreating(null)} onSaved={refresh} personId={creating.personId} personLabel={creating.label} dealId={creating.dealId} />}
      {editing && <TaskFormModal open onClose={() => setEditing(null)} onSaved={refresh} initialData={editing} />}
    </div>
  );
}
