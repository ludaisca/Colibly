"use client";

import { useState } from "react";
import { Loader2, PenLine } from "lucide-react";
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
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-darker hover:bg-surface-light hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent-strong"
      title={loading ? "Reescribiendo…" : "Reescribir"}
      aria-label="Reescribir el borrador"
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : <PenLine size={18} />}
    </button>
  );
}
