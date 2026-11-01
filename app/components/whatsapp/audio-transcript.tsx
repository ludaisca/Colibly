"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Languages } from "lucide-react";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";

// Transcripción bajo la burbuja de una nota de voz. Si ya existe (manual o
// automática) se muestra plegable; si no, un botón la pide a
// POST /api/whatsapp/messages/[id]/transcribe (1 crédito de IA).
export function AudioTranscript({ messageId, initial }: { messageId: string; initial: string | null }) {
  const [requested, setRequested] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const { error: toastError } = useToast();
  // El polling puede traer la transcripción automática después del montaje.
  const transcript = initial ?? requested;

  async function transcribe() {
    setLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/messages/${messageId}/transcribe`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo transcribir el audio");
      setRequested(data.transcript);
      setOpen(true);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo transcribir el audio");
    } finally {
      setLoading(false);
    }
  }

  if (!transcript) {
    return (
      <button
        type="button"
        onClick={transcribe}
        disabled={loading}
        className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-darker transition-colors hover:bg-surface-light hover:text-foreground disabled:opacity-60"
        title="Usa 1 crédito de IA"
      >
        {loading ? <Spinner size="sm" /> : <Languages size={12} aria-hidden />}
        {loading ? "Transcribiendo…" : "Transcribir"}
      </button>
    );
  }

  return (
    <div className="mt-1.5 border-t border-border pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-eyebrow uppercase text-muted-darker hover:text-foreground"
      >
        Transcripción {open ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
      </button>
      {open && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{transcript}</p>}
    </div>
  );
}
