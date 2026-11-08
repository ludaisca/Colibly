"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/ui/toast";

type Task = { id: string; title: string; done: boolean };

export function ContactTasks({ contactId, onChanged }: { contactId: string; onChanged?: () => void }) {
  const { error: toastError } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/whatsapp/contacts/${contactId}/tasks`);
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) setTasks(data);
  }, [contactId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al abrir el contacto
    void load();
  }, [load]);

  async function create(suggest = false) {
    setBusy(true);
    try {
      const res = await fetch(`/api/whatsapp/contacts/${contactId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(suggest ? { suggest: true } : { title }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(typeof body.error === "string" ? body.error : "No se pudo crear la tarea");
        return;
      }
      setTitle("");
      setTasks((current) => [body, ...current]);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(task: Task) {
    const res = await fetch(`/api/whatsapp/contacts/${contactId}/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    });
    if (!res.ok) {
      toastError("No se pudo actualizar la tarea");
      return;
    }
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, done: !item.done } : item)));
    onChanged?.();
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-darker">Tareas</label>
      <ul className="mb-2 space-y-1">
        {tasks.map((task) => (
          <li key={task.id}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={task.done} onChange={() => void toggle(task)} className="mt-1" />
              <span className={task.done ? "text-muted line-through" : "text-foreground"}>{task.title}</span>
            </label>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) void create(false);
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Nueva tarea"
          aria-label="Nueva tarea"
          maxLength={200}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !title.trim()}>Agregar</Button>
      </form>
      <Button type="button" variant="link" size="sm" className="mt-2" disabled={busy} onClick={() => void create(true)}>
        Sugerir tarea con IA
      </Button>
    </div>
  );
}
