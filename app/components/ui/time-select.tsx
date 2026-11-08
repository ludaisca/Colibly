"use client";

import { useMemo } from "react";
import { Select } from "./select";

// Selector de hora (2026-11-07, revisión de pantallas): sustituye la parte de
// hora de `datetime-local`, que cada navegador dibuja distinto y en Chrome sale
// en formato de EE. UU. Valor `HH:MM` (24 h); se muestra con Intl es-MX
// ("9:30 a.m."). Pasos de `step` minutos; una hora guardada fuera del paso se
// conserva como opción extra para no perderla al editar.

const LOCALE = "es-MX";

function label(value: string, fmt: Intl.DateTimeFormat) {
  const [h, m] = value.split(":").map(Number);
  return fmt.format(new Date(2000, 0, 1, h, m));
}

/** Hora en punto con formato es-MX: 8 → "8:00 a.m."; 24 → "12:00 a.m. (medianoche)". */
export function formatHourOfDay(hour: number): string {
  const fmt = new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" });
  const text = fmt.format(new Date(2000, 0, 1, hour % 24, 0));
  return hour === 24 ? `${text} (medianoche)` : text;
}

export function TimeSelect({
  id,
  value,
  onChange,
  step = 15,
  placeholder = "Hora",
  ariaLabel,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  step?: number;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const options = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" });
    const list: string[] = [];
    for (let minutes = 0; minutes < 24 * 60; minutes += step) {
      list.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    }
    if (value && !list.includes(value)) list.push(value);
    list.sort();
    return list.map((v) => ({ value: v, label: label(v, fmt) }));
  }, [step, value]);

  return (
    <Select id={id} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={className}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </Select>
  );
}
