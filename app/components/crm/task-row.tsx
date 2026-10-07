"use client";

import { useState } from "react";
import { CalendarClock, Mail, MessageSquare, Phone, Users, ListChecks } from "lucide-react";
import { Badge } from "@/app/components/kit/badge";
import { Checkbox } from "@/app/components/kit/checkbox";
import { useToast } from "@/app/components/ui/toast";
import { formatDue, taskKindLabel, type TaskItem, type TaskKind } from "@/lib/crm/task-ui";

const KIND_ICON: Record<TaskKind, React.ElementType> = {
  TODO: ListChecks,
  CALL: Phone,
  MESSAGE: MessageSquare,
  EMAIL: Mail,
  MEETING: Users,
};

// Una tarea con su casilla para completarla (o reabrirla) y su fecha. Al hacer
// clic en el texto se abre la edición.
export function TaskRow({ task, onChanged, onEdit, showPerson = true }: { task: TaskItem; onChanged: () => void; onEdit?: (task: TaskItem) => void; showPerson?: boolean }) {
  const { error: toastError } = useToast();
  const [busy, setBusy] = useState(false);
  const done = task.status === "DONE";
  const Icon = KIND_ICON[task.kind];

  async function toggle(checked: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: checked ? "DONE" : "OPEN" }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo actualizar");
      onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  }

  const about = [showPerson ? task.person?.name ?? task.company?.name : task.company?.name, task.deal?.title].filter(Boolean).join(" · ");

  return (
    <div className="flex items-start gap-3 py-2.5">
      <Checkbox className="mt-0.5" checked={done} onCheckedChange={(v) => toggle(v === true)} disabled={busy} aria-label={done ? "Reabrir tarea" : "Completar tarea"} />
      <button type="button" onClick={() => onEdit?.(task)} disabled={!onEdit} className="min-w-0 flex-1 text-left">
        <p className={done ? "text-sm text-muted-foreground line-through" : "text-sm font-medium text-foreground"}>{task.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Icon size={12} />{taskKindLabel(task.kind)}</span>
          {about && <span className="truncate">{about}</span>}
          {task.assignee && <span>· {task.assignee.name}</span>}
        </p>
      </button>
      {task.dueAt && !done && (
        <Badge variant={task.overdue ? "error" : "outline"}><CalendarClock /><span suppressHydrationWarning>{formatDue(task.dueAt)}</span></Badge>
      )}
    </div>
  );
}
