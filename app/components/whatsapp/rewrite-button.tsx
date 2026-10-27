"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { useToast } from "@/app/components/ui/toast";

export function RewriteButton({ chatId, draft, onInsert }: { chatId: string; draft: string; onInsert: (text: string) => void }) {
  const { error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const ready = draft.trim().length > 0;

  async function rewrite() {
    if (!ready || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.text !== "string") {
        toastError(typeof body.error === "string" ? body.error : "No se pudo reescribir el borrador");
        return;
      }
      onInsert(body.text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void rewrite()}
      disabled={!ready || loading}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-surface-light disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent-strong"
      title="Reescribir el borrador con IA"
    >
      <PenLine size={16} className="text-accent-ink" />
      <span>{loading ? "Reescribiendo…" : "Reescribir"}</span>
    </button>
  );
}
