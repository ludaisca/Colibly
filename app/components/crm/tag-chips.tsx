"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/app/components/kit/badge";
import { Button } from "@/app/components/kit/button";
import { Input } from "@/app/components/kit/input";
import { Popover, PopoverPopup, PopoverTrigger } from "@/app/components/kit/popover";

export interface TagOption {
  id: string;
  name: string;
  color?: string;
}

// Etiquetas como chips: las asignadas se quitan con la X y un popover agrega
// una existente o crea una nueva. Es solo presentación — quien lo usa decide a
// qué endpoint llama cada acción (contacto o conversación).
export function TagChips({
  tags,
  allTags,
  onAdd,
  onRemove,
  onCreate,
  emptyLabel = "Sin etiquetas",
}: {
  tags: TagOption[];
  allTags: TagOption[];
  onAdd: (tagId: string) => void | Promise<void>;
  onRemove: (tagId: string) => void | Promise<void>;
  onCreate: (name: string) => void | Promise<void>;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const assigned = new Set(tags.map((t) => t.id));
  const available = allTags.filter((t) => !assigned.has(t.id));

  async function create() {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await onCreate(value);
      setName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.length === 0 && <span className="text-xs text-muted-foreground">{emptyLabel}</span>}
      {tags.map((tag) => (
        <Badge key={tag.id} variant="secondary" size="lg" className="gap-1 pr-1">
          {tag.name}
          <button type="button" onClick={() => onRemove(tag.id)} aria-label={`Quitar etiqueta ${tag.name}`} className="rounded-sm p-0.5 opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
            <X />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="ghost" size="xs" />}>
          <Plus /> Etiqueta
        </PopoverTrigger>
        <PopoverPopup align="start" className="w-64">
          <div className="space-y-2">
            {available.length > 0 && (
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {available.map((tag) => (
                  <li key={tag.id}>
                    <button type="button" onClick={() => onAdd(tag.id)} className="w-full rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-light focus-visible:bg-surface-light">
                      {tag.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva etiqueta" aria-label="Nombre de la nueva etiqueta" maxLength={40} />
              <Button type="submit" size="sm" variant="outline" disabled={!name.trim()} loading={busy}>Crear</Button>
            </form>
          </div>
        </PopoverPopup>
      </Popover>
    </div>
  );
}
