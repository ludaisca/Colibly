"use client";

import { useState } from "react";
import { Filter, Trash2 } from "lucide-react";
import { Popover } from "@astryxdesign/core/Popover";
import { Badge } from "@astryxdesign/core/Badge";
import { Select } from "./select";
import { Button } from "./button";
import { cn } from "./cn";

// Botón "Filtros" + panel de condiciones (campo → valor, agregar/quitar,
// aplicar/limpiar) — patrón compartido por cualquier lista con 2+ filtros
// opcionales de selección única (hoy: Chats, Contactos). Sin
// selector de "operador": todos los campos que alimenta son de selección
// única, así que un dropdown con una sola opción posible ("Igual a") sería
// decorativo, no funcional — si algún día se suma un campo que sí lo
// necesite (rango de fechas, texto libre), ahí vale la pena agregarlo.
//
// El panel es un Popover de Astryx (clic fuera y Escape lo cierran; los
// selectores de adentro abren su propia capa sin cerrarlo). No reusa
// <Dropdown panel> porque ese cierra con cualquier clic dentro.

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
  /** Solo el icono (cabeceras angostas, p. ej. la lista de chats); el número
   *  de filtros aplicados va como globo en la esquina. */
  compact?: boolean;
}

export function FiltersPanel({ fields, values, onApply, panelTitle = "Filtrar", className, compact = false }: FiltersPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(values);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() =>
    fields.filter((f) => values[f.key]).map((f) => f.key)
  );

  const addableFields = fields.filter((f) => !visibleKeys.includes(f.key));
  const appliedCount = fields.filter((f) => values[f.key]).length;

  function changeOpen(next: boolean) {
    if (next) {
      // Cada vez que se abre parte de lo aplicado, no de un borrador viejo.
      setDraft(values);
      setVisibleKeys(fields.filter((f) => values[f.key]).map((f) => f.key));
    }
    setOpen(next);
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

  const label = appliedCount > 0 ? `Filtros (${appliedCount} aplicados)` : "Filtros";

  return (
    <div className={cn("relative inline-flex", className)}>
      <Popover
        isOpen={open}
        onOpenChange={changeOpen}
        label={panelTitle}
        width={320}
        padding={4}
        closeButtonLabel="Cerrar filtros"
        content={
          <div>
            <p className="mb-3 text-sm font-semibold">{panelTitle}</p>

            {visibleKeys.length === 0 ? (
              <p className="mb-3 text-xs text-muted">Sin condiciones — agrega una para filtrar la lista.</p>
            ) : (
              <div className="mb-3 space-y-2">
                {visibleKeys.map((key) => {
                  const field = fields.find((f) => f.key === key);
                  if (!field) return null;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-xs font-semibold text-muted-darker">{field.label}</span>
                      <Select
                        aria-label={field.label}
                        value={draft[key] ?? ""}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={field.options.some((opt) => opt.value === "") ? undefined : "Selecciona una opción"}
                        compact
                        className="flex-1"
                      >
                        {field.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        icon={Trash2}
                        onClick={() => removeField(key)}
                        aria-label={`Quitar condición ${field.label}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {addableFields.length > 0 && (
              <Select
                aria-label="Añadir condición"
                value=""
                onChange={(e) => { if (e.target.value) addField(e.target.value); }}
                placeholder="+ Añadir condición"
                compact
                className="mb-3"
              >
                {addableFields.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </Select>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <Button variant="ghost" size="sm" onClick={clearAll}>Limpiar filtros</Button>
              <Button variant="primary" size="sm" onClick={apply}>Aplicar filtros</Button>
            </div>
          </div>
        }
      >
        {compact ? (
          <Button variant="ghost" size="icon" icon={Filter} aria-label={label} />
        ) : (
          <Button variant="secondary" size="sm" icon={Filter} aria-label={label}>
            Filtros
          </Button>
        )}
      </Popover>
      {appliedCount > 0 && (
        <span className={cn("pointer-events-none", compact ? "absolute -right-1 -top-1" : "ml-1 self-center")} aria-hidden>
          <Badge variant="teal" label={String(appliedCount)} />
        </span>
      )}
    </div>
  );
}
