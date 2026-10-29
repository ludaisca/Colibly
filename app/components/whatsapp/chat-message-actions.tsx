"use client";

import { useState } from "react";
import { Smile, Reply, BookmarkPlus, Loader2, MoreHorizontal, Copy } from "lucide-react";
import { Dropdown } from "@/app/components/ui/dropdown";
import { useToast } from "@/app/components/ui/toast";
import { REACTION_OPTIONS, canReactToMessage } from "@/lib/whatsapp/reaction-options";
import type { Message, AgentReaction } from "./chat-shared";

// Acciones del mensaje en un solo menú (estilo WhatsApp): antes eran dos
// iconos fijos por burbuja (responder + reaccionar) que ensuciaban el hilo,
// sobre todo en móvil. Ahora es un botón que aparece al hover/focus (siempre
// visible en táctil) y abre Responder / Copiar / Reaccionar / Guardar sticker.

const ITEM = "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-light focus-visible:outline-2 focus-visible:outline-accent-strong disabled:opacity-50";

function isCopyable(message: Message): boolean {
  if (message.messageType === "interactive" || message.messageType === "template") return false;
  const text = (message.body ?? message.caption ?? "").trim();
  return text.length > 0 && !/^\[[a-z]+\]$/i.test(text);
}

export function ChatMessageActions({ message, onReply, onReaction, canReact = true }: { message: Message; onReply?: (message: Message) => void; onReaction: (id: string, reaction: AgentReaction) => void; canReact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const { error: toastError, success } = useToast();
  const latest = message.agentReactions?.[0];
  const current = latest && ["accepted", "pending"].includes(latest.status) ? latest.emoji : message.agentReactionEmoji;
  const showReactions = canReact && canReactToMessage(message.timestamp) && message.status !== "failed";
  const copyable = isCopyable(message);
  const canSaveSticker = message.messageType === "sticker" && !!message.mediaUrl;
  const hasItems = !!onReply || copyable || showReactions || canSaveSticker;

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
      setOpen(false);
    } catch (err) { toastError(err instanceof Error ? err.message : "No se pudo guardar el sticker"); }
    finally { setSaving(false); }
  }

  async function copyText() {
    const text = (message.body ?? message.caption ?? "").trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      setOpen(false);
    } catch {
      toastError("No se pudo copiar el texto");
    }
  }

  if (!hasItems) return null;

  return (
    <div className="mb-2 flex shrink-0 flex-col items-center opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
      <Dropdown
        portal
        align={message.direction === "OUTBOUND" ? "right" : "left"}
        open={open}
        onOpenChange={setOpen}
        closeOnSelect={false}
        trigger={
          <button
            type="button"
            className="rounded-full p-1.5 text-muted-darker hover:bg-surface-light hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-strong"
            aria-expanded={open}
            aria-label="Acciones del mensaje"
            title="Acciones del mensaje"
          >
            <MoreHorizontal size={16} />
          </button>
        }
      >
        <div className="w-56 p-1">
          {onReply && (
            <button type="button" className={ITEM} onClick={() => { onReply(message); setOpen(false); }}>
              <Reply size={15} /> Responder
            </button>
          )}
          {copyable && (
            <button type="button" className={ITEM} onClick={() => void copyText()}>
              <Copy size={15} /> {copied ? "Copiado" : "Copiar texto"}
            </button>
          )}
          {showReactions && (
            <div className="px-2 pb-1 pt-2">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-darker"><Smile size={13} /> Reacción del equipo</p>
              <div className="flex gap-1">
                {REACTION_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    disabled={busy}
                    aria-label={`Reaccionar con ${emoji}`}
                    aria-pressed={current === emoji}
                    onClick={() => void react(current === emoji ? "" : emoji)}
                    className={`h-8 w-8 rounded-lg text-xl hover:bg-accent-subtle disabled:opacity-50 ${current === emoji ? "bg-accent-subtle ring-1 ring-accent-strong" : ""}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {busy && <p role="status" className="mt-2 text-xs text-muted-darker">Enviando a WhatsApp…</p>}
              {current && (
                <button type="button" disabled={busy} onClick={() => void react("")} className="mt-2 w-full rounded-lg p-2 text-xs text-danger hover:bg-danger-bg disabled:opacity-50">
                  Quitar nuestra reacción
                </button>
              )}
            </div>
          )}
          {canSaveSticker && (
            <button type="button" className={ITEM} disabled={saving} onClick={() => void saveSticker()}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <BookmarkPlus size={15} />} Guardar sticker
            </button>
          )}
        </div>
      </Dropdown>
    </div>
  );
}
