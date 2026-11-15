"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { SettingsBlock } from "@/app/components/ui/settings-block";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Button } from "@/app/components/ui/button";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { cn } from "@/app/components/ui/cn";
import { TAG_COLOR_OPTIONS, tagDeleteWarning, tagDotClass, type TagUsage } from "@/lib/tags-shared";
import { loadContactAccounts, type ContactAccountOption } from "@/app/components/whatsapp/contact-accounts";

interface TagRow {
  id: string;
  name: string;
  color: string;
  waAccountId: string | null;
  channelAccountId: string | null;
}

// Administrador de etiquetas (QA-018): renombrar, cambiar color y eliminar.
// Las etiquetas son por cuenta, así que cada fila dice de cuál es.
export function EtiquetasSection() {
  const { success, error: toastError } = useToast();
  const [tags, setTags] = useState<TagRow[] | null>(null);
  const [accounts, setAccounts] = useState<ContactAccountOption[]>([]);
  const [deleting, setDeleting] = useState<TagRow | null>(null);
  // Qué la usa como disparador (se pide al abrir la confirmación).
  const [usageWarning, setUsageWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [res, accountList] = await Promise.all([fetch("/api/whatsapp/tags"), loadContactAccounts().catch(() => [])]);
      const data = await res.json();
      setTags(Array.isArray(data) ? data : []);
      setAccounts(accountList);
    } catch {
      setTags([]);
      toastError("No se pudieron cargar las etiquetas");
    }
  }, [toastError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al montar
    void load();
  }, [load]);

  async function update(tag: TagRow, data: { name?: string; color?: string }) {
    const res = await fetch(`/api/whatsapp/tags/${tag.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError(typeof body.error === "string" ? body.error : "No se pudo guardar la etiqueta");
      return;
    }
    setTags((prev) => prev?.map((t) => (t.id === tag.id ? { ...t, ...data } : t)) ?? prev);
    success("Etiqueta guardada");
  }

  async function askDelete(tag: TagRow) {
    setUsageWarning(null);
    setDeleting(tag);
    try {
      const res = await fetch(`/api/whatsapp/tags/${tag.id}`, { cache: "no-store" });
      if (res.ok) setUsageWarning(tagDeleteWarning((await res.json()) as TagUsage));
    } catch {
      // Sin la lista, la confirmación queda con el texto general.
    }
  }

  async function remove(tag: TagRow) {
    setBusy(true);
    try {
      const res = await fetch(`/api/whatsapp/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTags((prev) => prev?.filter((t) => t.id !== tag.id) ?? prev);
      success("Etiqueta eliminada");
      setDeleting(null);
    } catch {
      toastError("No se pudo eliminar la etiqueta");
    } finally {
      setBusy(false);
    }
  }

  const accountName = (tag: TagRow) => {
    const id = tag.waAccountId ?? tag.channelAccountId;
    if (!id) return "Sin canal";
    return accounts.find((a) => a.id === id)?.name ?? "Cuenta";
  };

  return (
    <SettingsBlock id="etiquetas" title="Etiquetas" description="Renombra, cambia el color o elimina etiquetas. Cada cuenta tiene las suyas.">
      {tags === null ? (
        <Spinner />
      ) : tags.length === 0 ? (
        <p className="text-sm text-muted">Aún no hay etiquetas. Se crean desde la ficha de un contacto o el chat.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {tags.map((tag) => (
            <li key={tag.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span aria-hidden className={cn("h-[7px] w-[7px] shrink-0 rounded-full", tagDotClass(tag.color))} />
              <Input
                aria-label={`Nombre de la etiqueta ${tag.name}`}
                defaultValue={tag.name}
                maxLength={50}
                className="min-w-[10rem] flex-1"
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== tag.name) void update(tag, { name });
                  else event.target.value = tag.name;
                }}
                onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
              />
              <Select aria-label={`Color de ${tag.name}`} value={TAG_COLOR_OPTIONS.some((o) => o.id === tag.color) ? tag.color : "accent"} onChange={(event) => void update(tag, { color: event.target.value })} className="w-32">
                {TAG_COLOR_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </Select>
              <span className="w-28 truncate text-xs text-muted-darker">{accountName(tag)}</span>
              <Button type="button" variant="ghost" size="icon" icon={Trash2} aria-label={`Eliminar ${tag.name}`} onClick={() => void askDelete(tag)} />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => (deleting ? remove(deleting) : undefined)}
        loading={busy}
        title={`¿Eliminar "${deleting?.name ?? ""}"?`}
        description={`${usageWarning ? `${usageWarning} ` : ""}Se quita de todos los contactos y chats que la tienen. No se puede deshacer.`}
        confirmLabel="Eliminar"
      />
    </SettingsBlock>
  );
}
