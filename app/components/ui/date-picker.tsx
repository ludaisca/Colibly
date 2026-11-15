"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, X } from "lucide-react";
import { cn } from "./cn";
import { Calendar } from "./calendar";
import { Tooltip } from "./tooltip";
import { formatCalendarDate, type IsoRange } from "@/lib/format/calendar";

// Selectores de fecha y de rango (2026-11-07): un botón que muestra la fecha
// con Intl (es-MX) y abre el calendario de Tesela portado (ui/calendar.tsx)
// en un panel de Base UI. Reemplazan al selector hecho a mano y al rango de
// HeroUI; las APIs públicas no cambiaron. Valor en ISO `AAAA-MM-DD`.

const TRIGGER =
  "relative flex h-[38px] w-full items-center gap-2 rounded-sm border bg-surface-light pl-3 pr-9 text-left text-sm outline-none transition-colors focus-visible:border-accent-strong focus-visible:ring-2 focus-visible:ring-accent-muted data-[popup-open]:border-accent-strong disabled:cursor-not-allowed disabled:opacity-50";
const PANEL =
  "z-[80] rounded-lg border border-border bg-surface p-3 shadow-lg outline-none origin-[var(--transform-origin)] transition-[opacity,scale] duration-fast ease-brand data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none";

function ClearButton({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClear}
        className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-foreground"
      >
        <X size={14} aria-hidden />
      </button>
    </Tooltip>
  );
}

interface DatePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  showErrorMessage?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

export function DatePicker({
  value = "",
  onChange,
  placeholder = "Elige una fecha",
  error,
  showErrorMessage = false,
  disabled,
  min,
  max,
  id,
  ariaLabel,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const shown = formatCalendarDate(value);
  return (
    <div className={cn("relative", className)}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          id={id}
          data-focus-ring=""
          disabled={disabled}
          aria-invalid={!!error}
          aria-label={ariaLabel ? `${ariaLabel}${shown ? `: ${shown}` : ""}` : undefined}
          className={cn(TRIGGER, error ? "border-danger-border" : "border-border")}
        >
          <CalendarDays size={16} aria-hidden className="shrink-0 text-muted" />
          <span className={cn("truncate tabular-nums", !shown && "text-muted")}>{shown || placeholder}</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-[80] outline-none">
            <Popover.Popup aria-label={ariaLabel ?? "Elegir fecha"} className={PANEL}>
              <Calendar
                value={value}
                min={min}
                max={max}
                autoFocus
                onChange={(iso) => { onChange?.(iso); setOpen(false); }}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {value && !disabled && <ClearButton label={`Borrar ${ariaLabel ? ariaLabel.charAt(0).toLowerCase() + ariaLabel.slice(1) : "fecha"}`} onClear={() => onChange?.("")} />}
      {error && showErrorMessage && <p className="mt-1.5 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

/** Rango de fechas (antes `HeroDateRange`): dos meses en escritorio, uno en el celular. */
export function DateRangePicker({ value, onChange, label = "Periodo", max, clearable = true, className }: {
  value: IsoRange;
  onChange: (value: IsoRange) => void;
  label?: string;
  max?: string;
  /** Sin botón de borrar: para periodos que siempre tienen valor (reportes). */
  clearable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wide = useWide();
  const shown = value.start && value.end ? `${formatCalendarDate(value.start)} – ${formatCalendarDate(value.end)}` : "";
  return (
    <div className={cn("relative w-full sm:w-auto sm:min-w-64", className)}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger data-focus-ring="" aria-label={`${label}${shown ? `: ${shown}` : ""}`} className={cn(TRIGGER, "border-border")}>
          <CalendarDays size={16} aria-hidden className="shrink-0 text-muted" />
          <span className={cn("truncate tabular-nums", !shown && "text-muted")}>{shown || label}</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-[80] outline-none">
            <Popover.Popup aria-label={label} className={PANEL}>
              <Calendar
                mode="range"
                value={value}
                max={max}
                months={wide ? 2 : 1}
                autoFocus
                onChange={(range) => { onChange(range); setOpen(false); }}
              />
              <p className="mt-2 text-xs text-muted">Elige el primer y el último día.</p>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {clearable && (value.start || value.end) && <ClearButton label="Quitar filtro de fechas" onClear={() => onChange({ start: "", end: "" })} />}
    </div>
  );
}

/** ≥ 640 px: caben dos meses lado a lado. */
function useWide() {
  const [wide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches);
  return wide;
}
