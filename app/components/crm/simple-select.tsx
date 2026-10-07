"use client";

import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/app/components/kit/select";
import { cn } from "@/app/components/kit/utils";

export interface SimpleOption {
  value: string;
  label: string;
}

// Select del kit con la forma que piden casi todos los formularios del CRM:
// una lista plana de {valor, texto}. El valor vacío ("") es una opción más.
export function SimpleSelect({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = "Elige…",
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SimpleOption[];
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className={cn("w-full", className)}>
        <SelectValue>{current?.label ?? placeholder}</SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {options.map((o) => (
          <SelectItem key={o.value || "__empty"} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
