"use client";

import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import { ChevronDown, X, Check } from "lucide-react";
import { cn } from "./cn";

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
  ariaLabel?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value = [],
  onChange,
  placeholder = "Seleccionar...",
  error,
  disabled,
  id,
  ariaLabel,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  // Opción resaltada con ↑/↓ (el foco real se queda en el disparador y se
  // anuncia con aria-activedescendant) — -1 = ninguna.
  const [highlight, setHighlight] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const swallowSpace = useRef(false);
  const listId = useId();
  const chipsId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const selectedSet = new Set(value);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlight(-1);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (highlight < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const toggle = useCallback(
    (val: string) => {
      const next = value.includes(val)
        ? value.filter((v) => v !== val)
        : [...value, val];
      onChange?.(next);
    },
    [value, onChange]
  );

  const remove = useCallback(
    (val: string) => {
      onChange?.(value.filter((v) => v !== val));
    },
    [value, onChange]
  );

  const selectedOptions = options.filter((o) => selectedSet.has(o.value));

  function openList() {
    setOpen(true);
    setHighlight((h) => (h >= 0 ? h : Math.max(options.findIndex((o) => selectedSet.has(o.value)), 0)));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Tab") {
      setOpen(false);
      setHighlight(-1);
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
        setHighlight(-1);
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      if (options.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h < 0 ? (delta === 1 ? 0 : options.length - 1) : (h + delta + options.length) % options.length));
    } else if (open && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      if (options.length > 0) setHighlight(e.key === "Home" ? 0 : options.length - 1);
    } else if (open && (e.key === "Enter" || e.key === " ") && highlight >= 0) {
      // Con una opción resaltada alterna su selección; si no, el botón hace
      // su comportamiento nativo (cerrar).
      e.preventDefault();
      const opt = options[highlight];
      if (e.key === " ") swallowSpace.current = true;
      if (opt) toggle(opt.value);
    }
  }

  return (
    <div className={cn("relative", className)} ref={ref}>
      {/* Un <button> real no puede contener los <button> de quitar de cada
          etiqueta (HTML inválido: el navegador los reubica y rompe la
          hidratación). Por eso el disparador es un <button> hermano que cubre
          toda la caja, y las etiquetas se dibujan encima: solo sus botones de
          quitar reciben el puntero, el resto del clic cae en el disparador. */}
      <div
        className={cn(
          "relative w-full min-h-10 rounded-lg border bg-surface-light px-3 py-2 text-left text-base sm:text-sm transition-colors",
          "has-[button[role=combobox]:focus-visible]:border-accent-strong",
          error ? "border-danger-border" : "border-control-border",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <button
          type="button"
          role="combobox"
          id={id}
          aria-label={ariaLabel}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && highlight >= 0 ? optionId(highlight) : undefined}
          aria-describedby={chipsId}
          aria-invalid={error ? true : undefined}
          onClick={() => {
            setOpen(!open);
            setHighlight(-1);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            // Firefox activa el botón con Espacio al soltar la tecla: si el
            // keydown ya alternó una opción, se anula ese clic.
            if (e.key === " " && swallowSpace.current) {
              e.preventDefault();
              swallowSpace.current = false;
            }
          }}
          className={cn(
            "absolute -inset-px rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong",
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          )}
        />
        <div id={chipsId} className="pointer-events-none relative flex items-center gap-1.5 flex-wrap">
          {selectedOptions.length === 0 ? (
            <span className="text-muted-darker">{placeholder}</span>
          ) : (
            selectedOptions.map((opt) => (
              <span
                key={opt.value}
                className="inline-flex items-center gap-0.5 rounded-md bg-accent-subtle text-accent-ink px-2 py-0.5 text-xs font-medium"
              >
                {opt.label}
                {/* Área de 24x24; el margen negativo conserva el tamaño de la etiqueta. */}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Quitar ${opt.label}`}
                  onClick={() => remove(opt.value)}
                  className="pointer-events-auto -my-1 -mr-1.5 grid size-6 place-items-center rounded-md hover:text-foreground"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))
          )}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn(
              "ml-auto shrink-0 text-muted-darker transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </div>

      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          aria-label="Opciones"
          // Mantiene el foco en el disparador al pulsar una opción.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-50 mt-1.5 w-full rounded-xl border border-border bg-surface shadow-lg py-1 max-h-56 overflow-y-auto animate-fade-in"
        >
          {options.map((opt, i) => {
            const isSelected = selectedSet.has(opt.value);
            return (
              <div
                key={opt.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                data-index={i}
                onClick={() => toggle(opt.value)}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "w-full flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors",
                  isSelected
                    ? "bg-accent-subtle text-accent-ink"
                    : i === highlight
                      ? "bg-surface-light text-foreground"
                      : "text-foreground hover:bg-surface-light"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    isSelected
                      ? "border-accent-strong bg-accent text-on-accent"
                      : "border-control-border"
                  )}
                >
                  {isSelected && <Check size={11} />}
                </span>
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
