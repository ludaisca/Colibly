"use client";

import { useMemo, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "./cn";

// Selección única con búsqueda dentro del menú, sobre Base UI `Combobox`
// (patrón "input dentro del popup") desde 2026-11-07: listbox con flechas,
// Enter, Escape, `aria-activedescendant` y foco que vuelve al disparador. La
// API pública no cambió.

export interface SearchableSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  error?: string;
  showErrorMessage?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

// El filtro empieza a los 3 caracteres: con menos, una lista larga (docenas de
// plantillas) coincidiría casi entera y la lista solo parpadearía.
const MIN_SEARCH_LENGTH = 3;

function matches(option: SearchableSelectOption, query: string) {
  const q = query.trim().toLowerCase();
  return q.length < MIN_SEARCH_LENGTH || option.label.toLowerCase().includes(q);
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  error,
  showErrorMessage = false,
  disabled,
  id,
  className,
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  return (
    <div className={cn("relative", className)}>
      <Combobox.Root
        items={options}
        value={selected}
        onValueChange={(next: SearchableSelectOption | null) => {
          if (next && !next.disabled) onChange(next.value);
        }}
        inputValue={query}
        onInputValueChange={setQuery}
        onOpenChange={(open) => { if (!open) setQuery(""); }}
        filter={(item: SearchableSelectOption, q: string) => matches(item, q)}
        itemToStringLabel={(o: SearchableSelectOption) => o.label}
        isItemEqualToValue={(a: SearchableSelectOption, b: SearchableSelectOption) => a.value === b.value}
        disabled={disabled}
      >
        <Combobox.Trigger
          id={id}
          aria-invalid={!!error}
          className={cn(
            "relative flex w-full items-center gap-2 rounded-[9px] border bg-surface-light pl-3 sm:pl-4 pr-9 py-2 text-sm text-left transition-colors outline-none",
            "focus-visible:border-accent-strong focus-visible:ring-2 focus-visible:ring-accent-muted data-[popup-open]:border-accent-strong",
            error ? "border-danger-border" : "border-border",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-darker")}>{selected ? selected.label : placeholder}</span>
          <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-darker" />
        </Combobox.Trigger>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={6} collisionPadding={8} className="z-[80] w-[var(--anchor-width)] outline-none">
            <Combobox.Popup className="overflow-hidden rounded-lg border border-border bg-surface shadow-lg outline-none">
              <div className="relative border-b border-border">
                <Search size={14} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-darker" />
                <Combobox.Input
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-darker"
            // El anillo lo pinta el contenedor; la regla global de foco (sin capa) le gana a las utilidades.
            style={{ outline: "none" }}
                />
              </div>
              <Combobox.Empty className="px-3.5 py-2.5 text-sm text-muted-darker empty:hidden">Sin resultados</Combobox.Empty>
              <Combobox.List className="max-h-[min(14rem,var(--available-height))] overflow-y-auto py-1 empty:py-0">
                {(opt: SearchableSelectOption) => (
                  <Combobox.Item
                    key={opt.value}
                    value={opt}
                    disabled={opt.disabled}
                    className="flex w-full cursor-default select-none items-center gap-2.5 px-3.5 py-2 text-left text-sm text-foreground outline-none data-[highlighted]:bg-surface-light data-[selected]:bg-accent-subtle data-[selected]:text-accent-ink data-[disabled]:cursor-not-allowed data-[disabled]:text-muted-darker"
                  >
                    <span className="flex-1 truncate">{opt.label}</span>
                    <Combobox.ItemIndicator className="shrink-0">
                      <Check size={14} aria-hidden />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {error && showErrorMessage && (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
