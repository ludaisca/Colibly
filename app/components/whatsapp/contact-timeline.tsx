"use client";

import { useCallback, useEffect, useState } from "react";
import { RelativeTime } from "@/app/components/ui/relative-time";
import type { ElementType } from "react";
import {
  CalendarClock,
  CheckCircle2,
  GitBranch,
  Megaphone,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Tag,
  UserCheck,
  UserPlus,
  ListTodo,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";

interface Activity {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
  actor: { id: string; name: string | null } | null;
}

const ICONS: Record<string, ElementType> = {
  CONTACT_CREATED: UserPlus,
  LEAD_STATUS_CHANGED: GitBranch,
  TAG_ADDED: Tag,
  CONVERSATION_ASSIGNED: UserCheck,
  CONVERSATION_RESOLVED: CheckCircle2,
  APPOINTMENT_CREATED: CalendarClock,
  APPOINTMENT_STATUS_CHANGED: CalendarClock,
  LEAD_SCORED: Sparkles,
  LEAD_AD_CAPTURED: Megaphone,
  NOTE_ADDED: StickyNote,
  TASK_CREATED: ListTodo,
  TASK_COMPLETED: CheckCircle2,
  TASK_REOPENED: ListTodo,
  TASK_DELETED: ListTodo,
  CUSTOM_FIELDS_UPDATED: SlidersHorizontal,
};

export function ContactTimeline({ contactId, refreshKey = 0 }: { contactId: string; refreshKey?: number }) {
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { error: toastError } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/whatsapp/contacts/${contactId}/activities?limit=50`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar la actividad");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar la actividad";
      setError(message);
      toastError(message);
    } finally {
      setLoading(false);
    }
  }, [contactId, toastError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/refresh
    void load();
  }, [load, refreshKey]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="block text-xs font-medium text-muted-darker">Actividad</label>
        <Button type="button" variant="ghost" size="sm" icon={RefreshCw} onClick={() => void load()} disabled={loading}>
          Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted">
          <Spinner /> Cargando actividad…
        </div>
      ) : error ? (
        <p className="py-2 text-xs text-danger">{error}</p>
      ) : items.length === 0 ? (
        <p className="py-2 text-xs text-muted-darker">Sin actividad todavía.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((item) => {
            const Icon = ICONS[item.type] ?? Sparkles;
            return (
              <li key={item.id} className="flex gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-accent-subtle text-accent-ink">
                  <Icon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{item.title}</p>
                  {item.body && <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-muted">{item.body}</p>}
                  <p className="mt-0.5 text-[10px] text-muted-darker">
                    <RelativeTime value={item.createdAt} />
                    {item.actor?.name ? ` · ${item.actor.name}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
