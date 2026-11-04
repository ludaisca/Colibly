"use client";

import { useEffect, useState } from "react";
import type { ViewCounts } from "./chat-shared";
import { Bookmark, Hourglass, Inbox, Plus, Trash2, User, UserX } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Dropdown } from "@/app/components/ui/dropdown";
import { Input } from "@/app/components/ui/input";
import { Modal } from "@/app/components/ui/modal";

interface SavedView {
  id: string;
  name: string;
  query: string;
}

const STORAGE_KEY = "colibly:chat-views";

type CountKey = keyof ViewCounts;

// Vistas rápidas: el mismo query que aplicaría una vista guardada. Los
// contadores llegan por GET /api/inbox/sync (lib/chats/counts.ts, mismos builders que la
// lista). Sin pestañas en la cabecera: se quitaron a propósito.
const QUICK_VIEWS: Array<{ key: CountKey; label: string; query: string; icon: typeof Inbox }> = [
  { key: "awaiting", label: "Esperando respuesta", query: "awaiting=1", icon: Hourglass },
  { key: "mine", label: "Míos", query: "assigned=me", icon: User },
  { key: "unassigned", label: "Sin asignar", query: "assigned=unassigned", icon: UserX },
  { key: "all", label: "Todos los activos", query: "", icon: Inbox },
];

function formatCount(n: number): string {
  return n > 999 ? "999+" : String(n);
}

function readViews(): SavedView[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is SavedView =>
      v && typeof v.id === "string" && typeof v.name === "string" && typeof v.query === "string"
    );
  } catch {
    return [];
  }
}

// Vistas guardadas en el navegador (no en la organización): es la versión
// barata de "Mis chats sin responder" sin abrir un modelo de permisos. Si más
// adelante se necesitan compartidas, se migran a una tabla SavedView.
export function ChatViewsMenu({
  currentQuery,
  onApply,
  counts,
}: {
  currentQuery: string;
  onApply: (query: string) => void;
  /** De la sincronización de la bandeja; null mientras no llega el primero. */
  counts: ViewCounts | null;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const awaiting = counts?.awaiting ?? 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga única desde localStorage
    setViews(readViews());
  }, []);

  function persist(next: SavedView[]) {
    setViews(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage lleno o deshabilitado: la vista funciona en esta sesión.
    }
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    persist([...views, { id: crypto.randomUUID(), name: trimmed, query: currentQuery }]);
    setName("");
    setSaveOpen(false);
  }

  function remove(id: string) {
    persist(views.filter((view) => view.id !== id));
  }

  return (
    <>
      <Dropdown
        align="right"
        portal
        trigger={
          <button
            type="button"
            aria-label={awaiting > 0 ? `Vistas — ${awaiting} esperando respuesta` : "Vistas"}
            title="Vistas"
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-muted-darker transition-colors hover:bg-surface-light hover:text-foreground"
          >
            <Bookmark size={15} />
            {awaiting > 0 && (
              <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold tabular-nums text-surface">
                {awaiting > 99 ? "99+" : awaiting}
              </span>
            )}
          </button>
        }
      >
        <div className="w-64 p-1">
          <p className="px-2.5 pb-1 pt-1.5 text-eyebrow uppercase text-muted-darker">Vistas rápidas</p>
          {QUICK_VIEWS.map((view) => (
            <button
              key={view.key}
              type="button"
              onClick={() => onApply(view.query)}
              className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-light"
            >
              <view.icon size={14} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{view.label}</span>
              {counts && (
                <span className={`tabular-nums text-xs ${view.key === "awaiting" && counts.awaiting > 0 ? "font-semibold text-warning" : "text-muted-darker"}`}>
                  {formatCount(counts[view.key])}
                </span>
              )}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-sm text-accent-ink transition-colors hover:bg-accent-subtle"
          >
            <Plus size={15} /> Guardar vista actual
          </button>
          {views.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted">Aún no tienes vistas guardadas.</p>
          ) : (
            <div className="mt-1 space-y-0.5 border-t border-border pt-1">
              {views.map((view) => (
                <div key={view.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onApply(view.query)}
                    className="min-w-0 flex-1 truncate rounded-[9px] px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-light"
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Eliminar vista ${view.name}`}
                    onClick={() => remove(view.id)}
                    className="shrink-0 rounded-[9px] p-1.5 text-muted-darker transition-colors hover:bg-danger-bg hover:text-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dropdown>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Guardar vista"
        description="Se guarda en este navegador con los filtros actuales."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!name.trim()}>Guardar</Button>
          </>
        }
      >
        <label className="block text-xs font-medium text-muted-darker" htmlFor="chat-view-name">
          Nombre de la vista
        </label>
        <Input
          id="chat-view-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ej. Mis chats sin responder"
          autoFocus
          onKeyDown={(event) => { if (event.key === "Enter") save(); }}
        />
      </Modal>
    </>
  );
}
