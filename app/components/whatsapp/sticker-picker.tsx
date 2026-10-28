"use client";

import { useRef, useState } from "react";
import { Sticker, Upload, Star, Send, Trash2 } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/ui/toast";

interface Item { id: string; name: string; favorite: boolean; animated: boolean; lastUsedAt: string | null }
export function StickerPicker({ disabled, onSend }: { disabled: boolean; onSend: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { error: toastError } = useToast();
  const selected = items.find((item) => item.id === selectedId);
  const visible = filter === "favorites" ? items.filter((i) => i.favorite) : filter === "recent" ? items.filter((i) => i.lastUsedAt).sort((a, b) => Date.parse(b.lastUsedAt!) - Date.parse(a.lastUsedAt!)) : items;

  async function load() {
    setLoading(true); setFailed(false);
    try {
      const res = await fetch("/api/whatsapp/stickers");
      if (!res.ok) throw new Error("No se pudo cargar la biblioteca");
      setItems(await res.json());
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }
  async function upload(file: File) {
    setBusy(true);
    try {
      if (file.size > 500 * 1024) throw new Error("El sticker no puede superar 500 KB");
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/whatsapp/stickers", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      await load(); setFilter("all"); setSelectedId(data.id); setConfirmDelete(false);
    } catch (err) { toastError(err instanceof Error ? err.message : "No se pudo subir el sticker"); }
    finally { setBusy(false); }
  }
  async function update(remove = false) {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/whatsapp/stickers/${selected.id}`, { method: remove ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, ...(remove ? {} : { body: JSON.stringify({ favorite: !selected.favorite }) }) });
      if (!res.ok) throw new Error("No se pudo actualizar el sticker");
      if (remove) setSelectedId(null);
      setConfirmDelete(false); await load();
    } catch (err) { toastError(err instanceof Error ? err.message : "No se pudo actualizar"); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!selected || busy) return;
    setBusy(true);
    try { await onSend(selected.id); setOpen(false); }
    catch (err) { toastError(err instanceof Error ? err.message : "No se pudo enviar el sticker"); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" disabled={disabled} onClick={() => { setOpen(true); setSelectedId(null); setConfirmDelete(false); load(); }} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-darker hover:bg-surface-light hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent-strong" title="Stickers" aria-label="Stickers"><Sticker size={18} /></button>
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title="Stickers del equipo" size="md">
      <div className="space-y-4">
        <p className="text-xs text-muted-darker">Biblioteca compartida por tu organización · {items.length}/100. WebP de 512 × 512 px: hasta 100 KB estáticos o 500 KB animados.</p>
        <div className="flex flex-wrap items-center gap-2">
          {[["all", "Todos"], ["recent", "Recientes"], ["favorites", "Favoritos"]].map(([key, label]) => <button key={key} type="button" disabled={busy} aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-xl px-3 py-2 text-xs ${filter === key ? "bg-accent-subtle text-accent-ink" : "bg-background text-muted-darker"}`}>{label}</button>)}
          <Button type="button" size="sm" variant="secondary" icon={Upload} disabled={busy} onClick={() => fileRef.current?.click()}>Subir</Button>
          <input ref={fileRef} type="file" accept="image/webp,.webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) upload(file); }} />
        </div>
        {loading ? <p role="status" className="py-8 text-center text-sm text-muted-darker">Cargando stickers…</p> : failed ? <Button type="button" variant="secondary" onClick={load}>Reintentar cargar</Button> : visible.length === 0 ? <p className="py-8 text-center text-sm text-muted-darker">{filter === "all" ? "Sube tu primer sticker o guarda uno recibido desde el chat." : "Todavía no hay stickers en esta sección."}</p> : (
          <div className="grid max-h-[40dvh] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
            {visible.map((item) => <button key={item.id} type="button" disabled={busy} aria-label={`Seleccionar ${item.name}`} aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setConfirmDelete(false); }} className={`relative rounded-xl border p-2 hover:bg-accent-subtle ${selectedId === item.id ? "border-accent-strong bg-accent-subtle" : "border-border bg-background"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated media endpoint */}
              <img src={`/api/whatsapp/stickers/${item.id}`} alt={item.name} className="aspect-square w-full object-contain" loading="lazy" />
              {item.favorite && <Star size={13} className="absolute right-1 top-1 fill-accent-ink text-accent-ink" />}
            </button>)}
          </div>
        )}
        {selected && <div className="space-y-3 border-t border-border pt-3">
          <p className="truncate text-sm font-medium">{selected.name}</p>
          {confirmDelete ? <div className="space-y-2"><p className="text-sm">¿Eliminar de la biblioteca de todo el equipo? Los mensajes enviados se conservan.</p><div className="flex gap-2"><Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => update(true)}>Eliminar</Button><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</Button></div></div> : <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" icon={Star} disabled={busy} onClick={() => update()}>{selected.favorite ? "Quitar favorito" : "Favorito"}</Button>
            <Button type="button" size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => setConfirmDelete(true)}>Eliminar</Button>
            <Button type="button" size="sm" icon={Send} loading={busy} onClick={send}>Enviar sticker</Button>
          </div>}
        </div>}
      </div>
    </Modal>
  </>;
}
