"use client";

import { useState } from "react";
import { Smile, Reply, BookmarkPlus, Loader2 } from "lucide-react";
import { Dropdown } from "@/app/components/ui/dropdown";
import { useToast } from "@/app/components/ui/toast";
import { REACTION_OPTIONS, canReactToMessage } from "@/lib/whatsapp/reaction-options";
import type { Message, AgentReaction } from "./chat-shared";

export function ChatMessageActions({ message, onReply, onReaction }: { message: Message; onReply?: (message: Message) => void; onReaction: (id: string, reaction: AgentReaction) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const { error: toastError, success } = useToast();
  const actionClass = "rounded-xl p-2 text-muted-darker hover:bg-surface-light hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";
  const latest = message.agentReactions?.[0];
  const current = latest && ["accepted", "pending"].includes(latest.status) ? latest.emoji : message.agentReactionEmoji;

  async function react(emoji: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/whatsapp/messages/${message.id}/reaction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo reaccionar");
      onReaction(message.id, data);
      setOpen(false);
    } catch (err) { toastError(err instanceof Error ? err.message : "No se pudo reaccionar"); }
    finally { setBusy(false); }
  }

  async function saveSticker() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/stickers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: message.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      success("Sticker guardado en la biblioteca del equipo");
    } catch (err) { toastError(err instanceof Error ? err.message : "No se pudo guardar el sticker"); }
    finally { setSaving(false); }
  }

  return (
    <div className="mb-2 flex shrink-0 flex-col items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
      <button type="button" onClick={() => onReply?.(message)} className={actionClass} aria-label="Responder a este mensaje" title="Responder"><Reply size={15} /></button>
      {canReactToMessage(message.timestamp) && message.status !== "failed" && (
        <Dropdown portal open={open} onOpenChange={setOpen} closeOnSelect={false} trigger={<button type="button" className={actionClass} aria-expanded={open} aria-label="Reaccionar al mensaje" title="Reaccionar"><Smile size={15} /></button>}>
          <div className="p-2">
            <p className="px-1 pb-2 text-xs text-muted-darker">Reacción del equipo</p>
            <div className="flex gap-1">
              {REACTION_OPTIONS.map((emoji) => <button key={emoji} type="button" disabled={busy} aria-label={`Reaccionar con ${emoji}`} aria-pressed={current === emoji} onClick={() => react(current === emoji ? "" : emoji)} className={`h-8 w-8 rounded-xl text-xl hover:bg-accent-subtle disabled:opacity-50 ${current === emoji ? "bg-accent-subtle ring-1 ring-accent-strong" : ""}`}>{emoji}</button>)}
            </div>
            {busy && <p role="status" className="mt-2 text-xs text-muted-darker">Enviando a WhatsApp…</p>}
            {current && <button type="button" disabled={busy} onClick={() => react("")} className="mt-2 w-full rounded-xl p-2 text-xs text-danger hover:bg-danger-bg">Quitar nuestra reacción</button>}
          </div>
        </Dropdown>
      )}
      {message.messageType === "sticker" && message.mediaUrl && <button type="button" disabled={saving} onClick={saveSticker} className={actionClass} aria-label="Guardar sticker en la biblioteca" title="Guardar sticker">{saving ? <Loader2 size={15} className="animate-spin" /> : <BookmarkPlus size={15} />}</button>}
    </div>
  );
}
