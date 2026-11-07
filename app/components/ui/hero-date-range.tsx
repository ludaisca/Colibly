"use client";

import { Tooltip } from "./tooltip";
import { useMemo } from "react";
import { CalendarDays, X } from "lucide-react";
import { DateField, DateRangePicker, RangeCalendar } from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { I18nProvider } from "react-aria-components";
import "./hero-ui.css";

export interface IsoDateRange { start: string; end: string }

function validDate(value: string): CalendarDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    const date = parseDate(value);
    return date.toString() === value ? date : null;
  } catch {
    return null;
  }
}

export function HeroDateRange({ value, onChange, label = "Periodo", className }: {
  value: IsoDateRange;
  onChange: (value: IsoDateRange) => void;
  label?: string;
  className?: string;
}) {
  const selected = useMemo(() => {
    const start = validDate(value.start);
    const end = validDate(value.end);
    return start && end && start.compare(end) <= 0 ? { start, end } : null;
  }, [value.start, value.end]);

  return <I18nProvider locale="es-MX"><div className={`colibly-hero-range-wrap ${className ?? ""}`}>
    <DateRangePicker
      aria-label={label}
      className="colibly-hero-range"
      value={selected}
      onChange={(next) => onChange(next ? { start: next.start.toString(), end: next.end.toString() } : { start: "", end: "" })}
    >
      <DateField.Group>
        <DateField.InputContainer>
          <DateField.Input slot="start">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
          <DateRangePicker.RangeSeparator>—</DateRangePicker.RangeSeparator>
          <DateField.Input slot="end">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        </DateField.InputContainer>
        <DateField.Suffix><DateRangePicker.Trigger aria-label="Abrir calendario"><CalendarDays size={16} /></DateRangePicker.Trigger></DateField.Suffix>
      </DateField.Group>
      <DateRangePicker.Popover className="colibly-hero-range-popover">
        <RangeCalendar aria-label={label} firstDayOfWeek="mon">
          <RangeCalendar.Header>
            <RangeCalendar.NavButton slot="previous" aria-label="Mes anterior" />
            <RangeCalendar.Heading />
            <RangeCalendar.NavButton slot="next" aria-label="Mes siguiente" />
          </RangeCalendar.Header>
          <RangeCalendar.Grid>
            <RangeCalendar.GridHeader>{(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
            <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
          </RangeCalendar.Grid>
        </RangeCalendar>
      </DateRangePicker.Popover>
    </DateRangePicker>
    {(value.start || value.end) && <Tooltip label="Quitar filtro de fechas"><button type="button" className="colibly-hero-range-clear" onClick={() => onChange({ start: "", end: "" })} aria-label="Quitar filtro de fechas"><X size={14} /></button></Tooltip>}
  </div></I18nProvider>;
}
