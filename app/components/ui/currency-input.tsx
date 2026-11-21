"use client";

import type { KeyboardEvent } from "react";
import { InputGroup, InputGroupText } from "@astryxdesign/core/InputGroup";
import { Input } from "./input";
import { FormFieldContext } from "./form-field-context";
import { amountValue, formatAmountValue, parseAmount, reformatWithCaret, renderAmount } from "@/lib/format/currency-input";

// Importe en pesos con formato mientras se escribe ("12,500.00"), portado de
// `tsl-currency` (Tesela). Controlado por texto visible: `value` y `onChange`
// trabajan con el texto; `amountValue()` da el valor canónico para el
// servidor. ↑/↓ suman o restan `step`; al salir completa los decimales.
export function CurrencyInput({
  id,
  value,
  onChange,
  placeholder = "0.00",
  step = 100,
  max,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  step?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // La coma del teclado numérico vale como punto decimal.
    if (e.key === "," && !value.includes(".")) {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? value.length;
      const next = reformatWithCaret(value.slice(0, start) + "." + value.slice(el.selectionEnd ?? start), start + 1);
      onChange(next.text);
      requestAnimationFrame(() => el.setSelectionRange(next.caret, next.caret));
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const now = parseFloat(amountValue(value) || "0");
      let next = now + (e.key === "ArrowUp" ? step : -step);
      next = Math.max(0, next);
      if (max !== undefined) next = Math.min(max, next);
      onChange(formatAmountValue(next));
      return;
    }
    // Junto a una coma de miles, borrar quita la cifra de al lado.
    const el = e.currentTarget;
    const at = el.selectionStart ?? 0;
    if ((e.key === "Backspace" || e.key === "Delete") && at === el.selectionEnd) {
      const back = e.key === "Backspace";
      if (value[back ? at - 1 : at] === ",") {
        e.preventDefault();
        const i = back ? at - 2 : at + 1;
        if (i < 0 || i >= value.length) return;
        const next = reformatWithCaret(value.slice(0, i) + value.slice(i + 1), i);
        onChange(next.text);
        requestAnimationFrame(() => el.setSelectionRange(next.caret, next.caret));
      }
    }
  }

  return (
    <div className={className}>
      <InputGroup label={ariaLabel ?? "Importe"} isLabelHidden isDisabled={disabled}>
        <InputGroupText>$</InputGroupText>
        {/* El grupo no pone etiqueta visible: el campo lleva su aria-label o
            la del FormField que lo envuelve (por `id`). */}
        <FormFieldContext.Provider value={null}>
          <Input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            aria-label={ariaLabel}
            value={value}
            placeholder={placeholder}
            onKeyDown={onKeyDown}
            onBlur={() => {
              const parsed = parseAmount(value);
              onChange(parsed.int || parsed.frac ? renderAmount(parsed, true) : "");
            }}
            onChange={(e) => {
              const el = e.target;
              const next = reformatWithCaret(el.value, el.selectionStart ?? el.value.length);
              onChange(next.text);
              requestAnimationFrame(() => el.setSelectionRange(next.caret, next.caret));
            }}
            inputClassName="tabular-nums"
          />
        </FormFieldContext.Provider>
        <InputGroupText>MXN</InputGroupText>
      </InputGroup>
    </div>
  );
}
