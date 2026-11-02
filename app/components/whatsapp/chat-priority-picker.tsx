"use client";

import { useState } from "react";
import { Select } from "@/app/components/ui/select";
import { useToast } from "@/app/components/ui/toast";
import { PRIORITY_OPTIONS, type ChatPriority } from "./chat-shared";

export function ChatPriorityPicker({
  chatId,
  priority,
  onChanged,
}: {
  chatId: string;
  priority: ChatPriority;
  onChanged: (priority: ChatPriority) => void;
}) {
  const [saving, setSaving] = useState(false);
  const { error: toastError } = useToast();

  async function change(next: ChatPriority) {
    if (saving || next === priority) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/priority`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cambiar prioridad");
      onChanged(data.priority);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al cambiar prioridad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select
      aria-label="Prioridad de la conversación"
      value={priority}
      disabled={saving}
      onChange={(event) => void change(event.target.value as ChatPriority)}
    >
      {PRIORITY_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </Select>
  );
}
