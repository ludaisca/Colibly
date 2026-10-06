"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import type { TaskItem } from "@/lib/crm/task-ui";
import { TaskFormModal } from "./task-form-modal";
import { TaskRow } from "./task-row";

// Tareas abiertas de la persona, con alta y edición. Va en la ficha del contacto.
export function ContactTasks({ personId, personLabel }: { personId: string; personLabel: string }) {
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskItem | null>(null);

  const load = useCallback(() => {
    fetch(`/api/crm/tasks?personId=${personId}&status=open&pageSize=20`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTasks(d.items))
      .catch(() => undefined);
  }, [personId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-eyebrow font-medium uppercase tracking-wider text-muted-darker">Tareas</p>
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => setCreating(true)}>Nueva tarea</Button>
      </div>
      {tasks && tasks.length === 0 && <p className="text-sm text-muted">Sin tareas pendientes.</p>}
      <div className="divide-y divide-border">
        {tasks?.map((t) => <TaskRow key={t.id} task={t} onChanged={load} onEdit={setEditing} showPerson={false} />)}
      </div>
      <TaskFormModal open={creating} onClose={() => setCreating(false)} onSaved={load} personId={personId} personLabel={personLabel} />
      {editing && <TaskFormModal open onClose={() => setEditing(null)} onSaved={load} initialData={editing} />}
    </div>
  );
}
