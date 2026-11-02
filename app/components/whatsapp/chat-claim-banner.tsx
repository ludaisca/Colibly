"use client";

import { useState } from "react";
import { UserCheck } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/ui/toast";

// Banner compacto del composer: en una bandeja compartida, el problema más
// caro no es contestar sino saber de quién es el chat. Se muestra solo cuando
// la conversación no tiene asignado y sigue abierta.
export function ChatClaimBanner({
  chatId,
  onAssigned,
}: {
  chatId: string;
  onAssigned: (assignee: { id: string; name: string | null } | null) => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const { error: toastError } = useToast();

  async function claim() {
    if (claiming) return;
    setClaiming(true);
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ self: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al asignar");
      onAssigned(data.assignedTo ?? null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al asignar");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-lg border border-dashed border-border bg-surface-light px-3 py-2 text-xs text-muted">
      <UserCheck size={14} className="shrink-0 text-muted-darker" />
      <span className="min-w-0 flex-1 truncate">Este chat no está asignado.</span>
      <Button type="button" size="sm" variant="secondary" loading={claiming} onClick={() => void claim()}>
        Asignarme
      </Button>
    </div>
  );
}
