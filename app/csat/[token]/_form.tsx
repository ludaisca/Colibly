"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { cn } from "@/app/components/ui/cn";

const LABELS = ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"];

export function CsatForm({ token }: { token: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (rating == null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/csat/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar la respuesta");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la respuesta");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 text-center">
        <CheckCircle2 size={28} className="mx-auto text-success" />
        <p className="mt-2 text-sm font-medium text-foreground">¡Gracias! Tu respuesta quedó registrada.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            aria-label={`${value} de 5: ${LABELS[value - 1]}`}
            aria-pressed={rating === value}
            className={cn(
              "flex h-11 items-center justify-center rounded-[9px] border text-sm font-semibold transition-colors",
              rating === value
                ? "border-accent-strong bg-accent text-on-accent"
                : "border-border bg-surface-light text-foreground hover:border-accent-muted"
            )}
          >
            {value}
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-muted">{rating ? LABELS[rating - 1] : "Elige una calificación"}</p>

      <Textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="¿Quieres contarnos algo más? (opcional)"
        rows={3}
        maxLength={1000}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button fullWidth onClick={() => void submit()} disabled={rating == null || submitting}>
        {submitting ? "Enviando…" : "Enviar respuesta"}
      </Button>
    </div>
  );
}
