"use client";

import { useEffect, useRef, useState } from "react";
import { Filter, Trash2 } from "lucide-react";
import { Select } from "./select";
import { Button } from "./button";
import { cn } from "./cn";

// Botón "Filtros" + panel de condiciones (campo → valor, agregar/quitar,
// aplicar/limpiar) — patrón compartido por cualquier lista con 2+ filtros
// opcionales de selección única (hoy: Bandeja de Chats, Contactos). Sin
// selector de "operador": todos los campos que alimenta son de selección
// única, así que un dropdown con una sola opción posible ("Igual a") sería
// decorativo, no funcional — si algún día se suma un campo que sí lo
// necesite (rango de fechas, texto libre), ahí vale la pena agregarlo.
//
// No reusa <Dropdown>: ese componente cierra el popover con onClick={close}
// en cualquier click dentro del contenido — correcto para un menú de
// opciones, pero rompería los <select> internos apenas el usuario intentara
// abrirlos. Este panel maneja su propio open/close (click-outside + Escape).

export interface FilterFieldOption {
  value: string;
  label: string;
}

export interface FilterFieldDef {
  key: string;
  label: string;
  options: FilterFieldOption[];
}

interface FiltersPanelProps {
  fields: FilterFieldDef[];
  /** Valores aplicados actualmente, por `key` de campo. "" = sin filtro. */
  values: Record<string, string>;
  onApply: (values: Record<string, string>) => void;
  panelTitle?: string;
  className?: string;
}

export function FiltersPanel({ fields, values, onApply, panelTitle = "Filtrar", className }: FiltersPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(values);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() =>
    fields.filter((f) => values[f.key]).map((f) => f.key)
  );
  const ref = useRef<HTMLDivElement>(null);

  const addableFields = fields.filter((f) => !visibleKeys.includes(f.key));
  const appliedCount = fields.filter((f) => values[f.key]).length;

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  function openPanel() {
    setDraft(values);
    setVisibleKeys(fields.filter((f) => values[f.key]).map((f) => f.key));
    setOpen(true);
  }

  function addField(key: string) {
    setVisibleKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }

  function removeField(key: string) {
    setVisibleKeys((prev) => prev.filter((k) => k !== key));
    setDraft((prev) => ({ ...prev, [key]: "" }));
  }

  function clearAll() {
    setVisibleKeys([]);
    setDraft(Object.fromEntries(fields.map((f) => [f.key, ""])));
  }

  function apply() {
    onApply(draft);
    setOpen(false);
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={cn(
          "relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
          appliedCount > 0
            ? "border-accent bg-accent/10 text-accent"
            : "border-border bg-surface text-muted hover:bg-surface-light"
        )}
      >
        <Filter size={13} />
        Filtros
        {appliedCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">
            {appliedCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1.5 w-80 origin-top-left animate-scale-in rounded-xl border border-border bg-surface p-4 shadow-lg">
          <p className="mb-3 text-sm font-bold">{panelTitle}</p>

          {visibleKeys.length === 0 ? (
            <p className="mb-3 text-xs text-muted">Sin condiciones — agrega una para filtrar la lista.</p>
          ) : (
            <div className="mb-3 space-y-2">
              {visibleKeys.map((key) => {
                const field = fields.find((f) => f.key === key);
                if (!field) return null;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs font-semibold text-muted-darker">
                      {field.label}
                    </span>
                    <Select
                      value={draft[key] ?? ""}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="flex-1"
                    >
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => removeField(key)}
                      aria-label={`Quitar condición ${field.label}`}
                      className="shrink-0 rounded-lg p-1.5 text-muted-darker transition-colors hover:bg-danger-bg hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {addableFields.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) addField(e.target.value);
              }}
              className="mb-3 cursor-pointer border-none bg-transparent text-xs font-semibold text-accent focus:outline-none"
            >
              <option value="" disabled>+ Añadir condición</option>
              {addableFields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={clearAll}>Limpiar filtros</Button>
            <Button variant="primary" size="sm" onClick={apply}>Aplicar filtros</Button>
          </div>
        </div>
      )}
    </div>
  );
}
