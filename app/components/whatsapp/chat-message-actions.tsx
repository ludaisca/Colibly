"use client";

import { useState } from "react";
import { Smile, Reply, BookmarkPlus, Loader2 } from "lucide-react";
import { Button } from "@/app/components/kit/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@/app/components/kit/popover";
import { cn } from "@/app/components/kit/utils";
import { useToast } from "@/app/components/ui/toast";
import { REACTION_OPTIONS, canReactToMessage } from "@/lib/whatsapp/reaction-options";
import type { Message, AgentReaction } from "./chat-shared";

export function ChatMessageActions({ message, onReply, onReaction }: { message: Message; onReply?: (message: Message) => void; onReaction: (id: string, reaction: AgentReaction) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const { error: toastError, success } = useToast();
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
    <div className="mb-1 flex shrink-0 items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
      <Button type="button" variant="ghost" size="icon-xs" onClick={() => onReply?.(message)} aria-label="Responder a este mensaje" title="Responder"><Reply /></Button>
      {canReactToMessage(message.timestamp) && message.status !== "failed" && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="Reaccionar al mensaje" title="Reaccionar" />}><Smile /></PopoverTrigger>
          <PopoverPopup align="center" className="w-auto">
            <p className="pb-2 text-xs text-muted-foreground">Reacción del equipo</p>
            <div className="flex gap-1">
              {REACTION_OPTIONS.map((emoji) => (
                <button key={emoji} type="button" disabled={busy} aria-label={`Reaccionar con ${emoji}`} aria-pressed={current === emoji} onClick={() => react(current === emoji ? "" : emoji)}
                  className={cn("size-8 rounded-lg text-xl outline-none hover:bg-surface-light focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", current === emoji && "bg-accent-subtle ring-1 ring-accent-strong")}>{emoji}</button>
              ))}
            </div>
            {busy && <p role="status" className="mt-2 text-xs text-muted-foreground">Enviando a WhatsApp…</p>}
            {current && <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={() => react("")} className="mt-2 w-full text-destructive-foreground">Quitar nuestra reacción</Button>}
          </PopoverPopup>
        </Popover>
      )}
      {message.messageType === "sticker" && message.mediaUrl && (
        <Button type="button" variant="ghost" size="icon-xs" disabled={saving} onClick={saveSticker} aria-label="Guardar sticker en la biblioteca" title="Guardar sticker">{saving ? <Loader2 className="animate-spin" /> : <BookmarkPlus />}</Button>
      )}
    </div>
  );
}
