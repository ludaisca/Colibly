"use client";

import { useEffect, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Loader2, Plus, Search, X } from "lucide-react";
import { Button } from "@/app/components/kit/button";
import { InputGroup, InputGroupAddon } from "@/app/components/kit/input-group";

// Selector con búsqueda en el servidor (contactos, empresas…). Muestra el valor
// elegido como una caja con su "x" y, sin valor, un buscador con los resultados
// al teclear. Con `onCreate` ofrece "Crear «texto»" cuando no hay coincidencia
// exacta. El filtrado lo hace el servidor (`filter={null}`).

export interface PickerOption {
  id: string;
  label: string;
  hint?: string | null;
}

const CREATE_ID = "__create__";

export function EntityPicker({
  value,
  onChange,
  search,
  placeholder = "Buscar…",
  ariaLabel,
  onCreate,
  disabled,
  autoFocus,
}: {
  value: PickerOption | null;
  onChange: (value: PickerOption | null) => void;
  search: (query: string) => Promise<PickerOption[]>;
  placeholder?: string;
  ariaLabel: string;
  onCreate?: (name: string) => Promise<PickerOption | null>;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    if (value) return;
    let alive = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await searchRef.current(query.trim());
        if (alive) setResults(found);
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [query, value]);

  if (value) {
    return (
      <div className="flex min-h-9 items-center justify-between gap-2 rounded-lg border bg-surface-light px-3 py-1.5 text-sm sm:min-h-8">
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">{value.label}</span>
          {value.hint && <span className="block truncate text-xs text-muted-foreground">{value.hint}</span>}
        </span>
        {!disabled && (
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`Quitar ${ariaLabel.toLowerCase()}`} onClick={() => { onChange(null); setQuery(""); }}>
            <X />
          </Button>
        )}
      </div>
    );
  }

  const trimmed = query.trim();
  const canCreate = !!onCreate && trimmed.length > 0 && !results.some((r) => r.label.toLowerCase() === trimmed.toLowerCase());
  const items: PickerOption[] = canCreate ? [...results, { id: CREATE_ID, label: trimmed }] : results;

  return (
    <Combobox.Root
      items={items}
      filter={null}
      inputValue={query}
      onInputValueChange={(v, details) => { if (!details.isItemPress) setQuery(v); }}
      itemToStringLabel={(item: PickerOption) => item.label}
      onValueChange={async (item: PickerOption | null) => {
        if (!item) return;
        if (item.id !== CREATE_ID) return onChange(item);
        if (!onCreate || creating) return;
        setCreating(true);
        try {
          const created = await onCreate(item.label);
          if (created) onChange(created);
        } finally {
          setCreating(false);
        }
      }}
    >
      <InputGroup>
        <InputGroupAddon>{loading || creating ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}</InputGroupAddon>
        <Combobox.Input
          aria-label={ariaLabel}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className="h-8.5 min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/72 sm:h-7.5"
        />
      </InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} className="z-[80] w-[var(--anchor-width)]">
          <Combobox.Popup className="max-h-64 overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-lg">
            <Combobox.Empty className="px-3 py-3 text-xs text-muted-foreground">{trimmed ? "Sin resultados." : "Escribe para buscar."}</Combobox.Empty>
            <Combobox.List>
              {(item: PickerOption) => (
                <Combobox.Item key={item.id} value={item} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-surface-light">
                  {item.id === CREATE_ID ? (
                    <>
                      <Plus size={14} className="shrink-0 text-accent-ink" aria-hidden="true" />
                      <span className="truncate">Crear «{item.label}»</span>
                    </>
                  ) : (
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{item.label}</span>
                      {item.hint && <span className="block truncate text-xs text-muted-foreground">{item.hint}</span>}
                    </span>
                  )}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

// Búsquedas listas para usar con EntityPicker.
export async function searchPeople(query: string): Promise<PickerOption[]> {
  const res = await fetch(`/api/crm/people?q=${encodeURIComponent(query)}&pageSize=8&sort=recent`);
  if (!res.ok) return [];
  const data = (await res.json()) as { items: Array<{ id: string; name: string; phone: string | null; email: string | null }> };
  return data.items.map((p) => ({ id: p.id, label: p.name, hint: p.email ?? p.phone }));
}

export async function searchCompanies(query: string): Promise<PickerOption[]> {
  const res = await fetch(`/api/crm/companies?q=${encodeURIComponent(query)}&pageSize=8&sort=name`);
  if (!res.ok) return [];
  const data = (await res.json()) as { items: Array<{ id: string; name: string; domain: string | null }> };
  return data.items.map((c) => ({ id: c.id, label: c.name, hint: c.domain }));
}

export async function createCompanyOption(name: string): Promise<PickerOption | null> {
  const res = await fetch("/api/crm/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  const data = await res.json();
  if (res.status === 409 && data.matches?.[0]) return { id: data.matches[0].id, label: data.matches[0].name ?? name };
  if (!res.ok) throw new Error(data.error ?? "No se pudo crear la empresa");
  return { id: data.id, label: data.name };
}
