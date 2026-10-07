"use client";

import { useCallback, useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { Button } from "@/app/components/kit/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/app/components/kit/empty";
import { Skeleton } from "@/app/components/kit/skeleton";
import { Textarea } from "@/app/components/kit/textarea";
import { useToast } from "@/app/components/ui/toast";
import { SimpleSelect } from "@/app/components/crm/simple-select";

// Notas internas de una persona. En el modelo actual una nota cuelga de una
// identidad de canal (un chat), así que se juntan las de todas y se escribe en
// la que se elija. Una persona sin ningún canal (p. ej. importada por CSV)
// todavía no puede tener notas: se avisa en vez de esconder el campo.

export interface NoteIdentity {
  id: string;
  label: string;
}

interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null };
  identityId: string;
}

export function PersonNotes({ identities, onChanged }: { identities: NoteIdentity[]; onChanged?: () => void }) {
  const { error: toastError } = useToast();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState("");
  const [target, setTarget] = useState(identities[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const ids = identities.map((i) => i.id).join(",");

  const load = useCallback(async () => {
    if (!ids) return setNotes([]);
    try {
      const lists = await Promise.all(
        ids.split(",").map(async (id) => {
          const res = await fetch(`/api/whatsapp/contacts/${id}/notes`);
          const data = res.ok ? await res.json() : [];
          return (Array.isArray(data) ? data : []).map((n: Omit<Note, "identityId">) => ({ ...n, identityId: id }));
        })
      );
      setNotes(lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch {
      setNotes([]);
    }
  }, [ids]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al montar y cuando cambian los canales
    void load();
  }, [load]);

  // Si el canal elegido ya no existe (o aún no se eligió), se usa el primero.
  const effectiveTarget = identities.some((i) => i.id === target) ? target : identities[0]?.id ?? "";

  async function add() {
    if (!text.trim() || !effectiveTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/whatsapp/contacts/${effectiveTarget}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar la nota");
      setText("");
      await load();
      onChanged?.();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo guardar la nota");
    } finally {
      setSaving(false);
    }
  }

  if (!identities.length) {
    return (
      <Empty className="py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon"><StickyNote /></EmptyMedia>
          <EmptyTitle>Todavía no se pueden guardar notas</EmptyTitle>
          <EmptyDescription>Las notas se guardan en una conversación del contacto. Cuando escriba por un canal al que tengas acceso, podrás agregarlas aquí.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Escribe una nota para el equipo" aria-label="Nueva nota" maxLength={5000} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {identities.length > 1 && (
            <div className="w-56">
              <SimpleSelect ariaLabel="Canal donde guardar la nota" value={effectiveTarget} onChange={setTarget} options={identities.map((i) => ({ value: i.id, label: i.label }))} />
            </div>
          )}
          <Button size="sm" onClick={add} disabled={!text.trim()} loading={saving}>Agregar nota</Button>
        </div>
      </div>
      {notes === null ? (
        <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin notas todavía.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border bg-card p-3">
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">{n.body}</p>
              <p suppressHydrationWarning className="mt-1.5 text-xs text-muted-foreground">
                {n.author.name ?? "Usuario"} · {new Date(n.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
