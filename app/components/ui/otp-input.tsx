"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "./cn";

// Código de verificación en casillas (portado de `tsl-otp`, Tesela). Una
// casilla por dígito: avanza sola, Retroceso vuelve, ← → navegan, y pegar (o
// el autocompletado de iOS/Android, que mete todo en la primera casilla)
// reparte el código. `onComplete` se dispara al llenar la última.
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  autoFocus,
  disabled,
  invalid,
  label = "Código de verificación",
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length }, (_, i) => value[i] ?? "");

  function setFrom(index: number, incoming: string) {
    const digits = incoming.replace(/\D/g, "");
    const next = chars.slice();
    if (!digits) {
      next[index] = "";
    } else {
      digits.slice(0, length - index).split("").forEach((d, k) => (next[index + k] = d));
    }
    const joined = next.join("").slice(0, length);
    onChange(joined);
    const focusAt = Math.min(index + Math.max(digits.length, 0), length - 1);
    if (digits) refs.current[focusAt]?.focus();
    if (joined.length === length && !next.includes("")) onComplete?.(joined);
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !chars[index] && index > 0) {
      e.preventDefault();
      const next = chars.slice();
      next[index - 1] = "";
      onChange(next.join(""));
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function onPaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    setFrom(index, e.clipboardData.getData("text"));
  }

  return (
    <div role="group" aria-label={label} className="flex justify-center gap-2">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={char}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Dígito ${index + 1} de ${length}`}
          aria-invalid={invalid || undefined}
          data-focus-ring=""
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => onKeyDown(index, e)}
          onPaste={(e) => onPaste(index, e)}
          onChange={(e) => setFrom(index, incomingText(e.target.value, char))}
          className={cn(
            "h-12 w-10 rounded-sm border bg-surface-light text-center tabular-nums text-lg font-semibold text-foreground transition-colors sm:w-11",
            "focus:outline-none focus:border-accent-strong focus-visible:ring-2 focus-visible:ring-accent-muted",
            invalid ? "border-danger-border" : "border-border"
          )}
        />
      ))}
    </div>
  );
}

// Lo que el usuario agregó a la casilla: con 1–2 caracteres es el dígito
// nuevo (se quita el que ya estaba); con más, un código completo pegado o
// autocompletado que se reparte desde aquí.
function incomingText(raw: string, previous: string): string {
  if (raw.length > 2 || !previous) return raw;
  const at = raw.indexOf(previous);
  return at === -1 ? raw : raw.slice(0, at) + raw.slice(at + 1);
}

