"use client";

import { useCallback, useEffect, useState } from "react";
import { ListChecks, Plus } from "lucide-react";
import { Button } from "@/app/components/kit/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/app/components/kit/empty";
import { Skeleton } from "@/app/components/kit/skeleton";
import type { TaskItem } from "@/lib/crm/task-ui";
import { TaskFormModal } from "./task-form-modal";
import { TaskRow } from "./task-row";

// Tareas de la persona (abiertas y, si se pide, completadas) con alta y
// edición. `compact` es la versión de la columna de la bandeja: sin estado
// vacío grande y sin el interruptor de completadas.
export function PersonTasks({
  personId,
  personLabel,
  compact = false,
  onChanged,
  refreshKey = 0,
}: {
  personId: string;
  personLabel: string;
  compact?: boolean;
  onChanged?: () => void;
  refreshKey?: number;
}) {
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskItem | null>(null);

  const load = useCallback(() => {
    fetch(`/api/crm/tasks?personId=${personId}&status=${showDone ? "all" : "open"}&pageSize=50`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTasks(d.items))
      .catch(() => undefined);
  }, [personId, showDone]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  function changed() {
    load();
    onChanged?.();
  }

  const header = (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tareas</h3>
      <div className="flex items-center gap-1">
        {!compact && (
          <Button size="xs" variant="ghost" onClick={() => setShowDone((v) => !v)} aria-pressed={showDone}>
            {showDone ? "Ocultar completadas" : "Ver completadas"}
          </Button>
        )}
        <Button size="xs" variant="ghost" onClick={() => setCreating(true)}><Plus /> Nueva tarea</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      {header}
      {tasks === null ? (
        <div className="space-y-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-4/5" /></div>
      ) : tasks.length === 0 ? (
        compact ? (
          <p className="text-sm text-muted-foreground">Sin tareas pendientes.</p>
        ) : (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ListChecks /></EmptyMedia>
              <EmptyTitle>Sin tareas pendientes</EmptyTitle>
              <EmptyDescription>Crea una para acordarte del siguiente paso con este contacto.</EmptyDescription>
            </EmptyHeader>
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}><Plus /> Nueva tarea</Button>
          </Empty>
        )
      ) : (
        <div className="divide-y">
          {tasks.map((t) => <TaskRow key={t.id} task={t} onChanged={changed} onEdit={setEditing} showPerson={false} />)}
        </div>
      )}
      <TaskFormModal open={creating} onClose={() => setCreating(false)} onSaved={changed} personId={personId} personLabel={personLabel} />
      {editing && <TaskFormModal open onClose={() => setEditing(null)} onSaved={changed} initialData={editing} />}
    </div>
  );
}
