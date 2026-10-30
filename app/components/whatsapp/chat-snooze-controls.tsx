"use client";

import { useState } from "react";
import { Clock, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/ui/toast";
import { useNowMs } from "./use-now";
import { formatSnoozeUntil, snoozeUntilFor } from "./chat-shared";

// Tres atajos, sin modal de calendario: cubren el 95 % de "lo veo luego" y
// mantienen la cabecera del chat sin un control más. La fecha libre puede
// llegar después si hace falta.
export function ChatSnoozeControls({
  chatId,
  snoozedUntil,
  onChanged,
}: {
  chatId: string;
  snoozedUntil: string | null;
  onChanged: (until: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const { error: toastError } = useToast();
  const now = useNowMs();
  const active = snoozedUntil ? new Date(snoozedUntil).getTime() > now : false;

  async function apply(until: string | null) {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/snooze`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ until }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al posponer");
      onChanged(data.snoozedUntil ?? null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al posponer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {active && snoozedUntil && (
        <p className="flex items-center gap-1.5 rounded-[9px] bg-warning-bg px-2.5 py-1.5 text-[11px] font-medium text-warning">
          <Clock size={12} />
          Pospuesto hasta {formatSnoozeUntil(snoozedUntil)}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void apply(snoozeUntilFor("1h"))}>
          1 hora
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void apply(snoozeUntilFor("tomorrow"))}>
          Mañana
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void apply(snoozeUntilFor("week"))}>
          1 semana
        </Button>
        {active && (
          <Button type="button" size="sm" variant="ghost" icon={X} disabled={saving} onClick={() => void apply(null)}>
            Quitar
          </Button>
        )}
      </div>
    </div>
  );
}
