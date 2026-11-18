"use client";

import { useCallback, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/ui/toast";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/app/components/ui/input";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

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

  useRunOnChange(() => void load(), [load]);

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
      <p className="mb-1.5 text-xs font-medium text-muted-darker">Tareas</p>
      <ul className="mb-2 space-y-1">
        {tasks.map((task) => (
          <li key={task.id}>
            <Checkbox
              checked={task.done}
              onChange={() => void toggle(task)}
              label={<span className={task.done ? "font-normal text-muted line-through" : "font-normal text-foreground"}>{task.title}</span>}
            />
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
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Nueva tarea…"
          aria-label="Nueva tarea"
          maxLength={200}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" disabled={busy || !title.trim()}>Agregar</Button>
      </form>
      <Button type="button" variant="link" size="sm" className="mt-2" disabled={busy} onClick={() => void create(true)}>
        Sugerir tarea con IA
      </Button>
    </div>
  );
}
