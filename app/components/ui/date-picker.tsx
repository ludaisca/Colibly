"use client";

import { DateInput } from "@astryxdesign/core/DateInput";
import type { ISODateString } from "@astryxdesign/core/utils";
import { DateRangeInput } from "@astryxdesign/core/DateRangeInput";
import type { IsoRange } from "@/lib/format/calendar";
import { markFormFieldControl, useFormFieldContext } from "./form-field-context";

// Adaptador (rediseño con Astryx): DateInput / DateRangeInput de Astryx
// (escribir la fecha o elegirla en el calendario, semana desde el lunes).
// API de siempre; valor en ISO `AAAA-MM-DD` y "" sin fecha.

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

const iso = (value?: string) => (value ? (value as ISODateString) : undefined);

export const DatePicker = markFormFieldControl(function DatePicker({
  value = "",
  onChange,
  placeholder = "Elige una fecha",
  error: errorProp,
  showErrorMessage = false,
  disabled,
  min,
  max,
  id,
  ariaLabel,
  className,
}: DatePickerProps) {
  const field = useFormFieldContext();
  const direct = field?.direct === true;
  const error = errorProp ?? (direct ? field?.error : undefined);
  return (
    <div className={className}>
      <DateInput
        id={id}
        label={field?.label ?? ariaLabel ?? placeholder}
        isLabelHidden={!direct}
        description={direct ? field?.hint : undefined}
        isRequired={direct ? field?.required : undefined}
        value={iso(value)}
        onChange={(next) => onChange?.(next ?? "")}
        placeholder={placeholder}
        min={iso(min)}
        max={iso(max)}
        isDisabled={disabled}
        hasClear
        weekStartsOn="mon"
        status={error ? { type: "error", message: direct || showErrorMessage ? error : undefined } : undefined}
        width="100%"
      />
    </div>
  );
});

export function DateRangePicker({
  value,
  onChange,
  label = "Periodo",
  max,
  clearable = true,
  className,
}: {
  value: IsoRange;
  onChange: (value: IsoRange) => void;
  label?: string;
  max?: string;
  clearable?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <DateRangeInput
        label={label}
        isLabelHidden
        value={value.start && value.end ? { start: value.start as ISODateString, end: value.end as ISODateString } : null}
        onChange={(range) => onChange(range ? { start: range.start, end: range.end } : { start: "", end: "" })}
        max={iso(max)}
        hasClear={clearable}
        placeholder="Elige un periodo"
      />
    </div>
  );
}
