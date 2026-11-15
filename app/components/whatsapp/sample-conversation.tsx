"use client";

import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Modal } from "@/app/components/ui/modal";
import { SAMPLE_CONVERSATIONS } from "@/lib/sample-data/sample-conversations";

// "Ver conversación de ejemplo": un fixture estático de solo lectura (no hay
// chats de ejemplo en la base de datos: un chat exige una cuenta conectada).
export function SampleConversationButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(SAMPLE_CONVERSATIONS[0].id);
  const active = SAMPLE_CONVERSATIONS.find((c) => c.id === activeId) ?? SAMPLE_CONVERSATIONS[0];

  return (
    <>
      <Button size={size} variant="secondary" icon={MessagesSquare} onClick={() => setOpen(true)}>Ver conversación de ejemplo</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Así se ve una conversación" description="Spa Aurora, Ciudad de México" size="md" footer={<Button variant="secondary" onClick={() => setOpen(false)}>Cerrar</Button>}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {SAMPLE_CONVERSATIONS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === activeId}
                onClick={() => setActiveId(c.id)}
                className={`rounded-full border px-3 py-1 text-xs ${c.id === activeId ? "border-accent-strong bg-accent-subtle text-accent-ink" : "border-border text-muted hover:border-accent-strong"}`}
              >
                {c.contact}
              </button>
            ))}
            <Badge tone="info" size="sm">Ejemplo, no es un chat real</Badge>
          </div>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-xl border border-border bg-surface-light p-3" role="log" aria-label={`Conversación de ejemplo con ${active.contact}`}>
            {active.messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "cliente" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.from === "cliente" ? "border border-border bg-surface text-foreground" : "bg-accent-subtle text-foreground"}`}>
                  <p className="mb-0.5 text-micro font-semibold text-muted-darker">{m.from === "cliente" ? active.contact : m.from === "bot" ? "Bot de IA" : "Equipo"} · {m.time}</p>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
