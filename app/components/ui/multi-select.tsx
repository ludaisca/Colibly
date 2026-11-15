"use client";

import React, { useMemo, useRef } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ChevronDown, X, Check } from "lucide-react";
import { cn } from "./cn";

// Selección múltiple con etiquetas, sobre Base UI `Combobox` (multiple) desde
// 2026-11-07: listbox con flechas, Enter, Escape, `aria-activedescendant`,
// quitar etiquetas con el teclado y escribir para filtrar. La API pública no
// cambió (`options`, `value`, `onChange` con los `value` como strings).

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value = [],
  onChange,
  placeholder = "Seleccionar…",
  error,
  disabled,
  id,
  className,
}: MultiSelectProps) {
  const chipsRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => {
    const set = new Set(value);
    return options.filter((o) => set.has(o.value));
  }, [options, value]);

  return (
    <div className={cn("relative", className)}>
      <Combobox.Root
        multiple
        items={options}
        value={selected}
        onValueChange={(next: Option[]) => onChange?.(next.map((o) => o.value))}
        itemToStringLabel={(o: Option) => o.label}
        isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
        disabled={disabled}
      >
        <Combobox.Chips
          ref={chipsRef}
          className={cn(
            "flex w-full min-h-[38px] flex-wrap items-center gap-1.5 rounded-sm border bg-surface-light px-3 py-1.5 text-sm transition-colors",
            "focus-within:border-accent-strong focus-within:ring-2 focus-within:ring-accent-muted",
            error ? "border-danger-border" : "border-border",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Combobox.Value>
            {(items: Option[]) =>
              items.map((item) => (
                <Combobox.Chip
                  key={item.value}
                  aria-label={item.label}
                  className="inline-flex items-center gap-0.5 rounded-md bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent-ink outline-none data-[highlighted]:ring-2 data-[highlighted]:ring-accent-muted"
                >
                  {item.label}
                  <Combobox.ChipRemove aria-label={`Quitar ${item.label}`} className="rounded hover:text-foreground">
                    <X size={12} aria-hidden />
                  </Combobox.ChipRemove>
                </Combobox.Chip>
              ))
            }
          </Combobox.Value>
          <Combobox.Input
            id={id}
            aria-invalid={!!error}
            placeholder={selected.length === 0 ? placeholder : ""}
            className="min-w-12 flex-1 bg-transparent py-0.5 text-sm text-foreground outline-none placeholder:text-muted-darker"
            // El anillo lo pinta el contenedor; la regla global de foco (sin capa) le gana a las utilidades.
            style={{ outline: "none" }}
          />
          <Combobox.Trigger aria-label="Ver opciones" className="ml-auto shrink-0 rounded text-muted-darker outline-none">
            <ChevronDown size={14} aria-hidden className="transition-transform data-[popup-open]:rotate-180" />
          </Combobox.Trigger>
        </Combobox.Chips>

        <Combobox.Portal>
          <Combobox.Positioner anchor={chipsRef} sideOffset={6} collisionPadding={8} className="z-[80] w-[var(--anchor-width)] outline-none">
            <Combobox.Popup className="max-h-[min(14rem,var(--available-height))] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg outline-none">
              <Combobox.Empty className="px-3.5 py-2 text-sm text-muted-darker empty:hidden">Sin resultados</Combobox.Empty>
              <Combobox.List>
                {(opt: Option) => (
                  <Combobox.Item
                    key={opt.value}
                    value={opt}
                    className="group flex w-full cursor-default select-none items-center gap-2.5 px-3.5 py-2 text-sm text-left text-foreground outline-none data-[highlighted]:bg-surface-light data-[selected]:text-accent-ink"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border group-data-[selected]:border-accent-strong group-data-[selected]:bg-accent group-data-[selected]:text-on-accent">
                      <Combobox.ItemIndicator>
                        <Check size={11} aria-hidden />
                      </Combobox.ItemIndicator>
                    </span>
                    {opt.label}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {error && <p className="mt-1.5 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
