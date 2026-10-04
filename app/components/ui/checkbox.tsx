"use client";

import React, { useId } from "react";
import { cn } from "./cn";

interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  ariaLabel?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  error?: string;
}

export function Checkbox({
  checked = false,
  onChange,
  label,
  ariaLabel,
  description,
  disabled,
  id,
  className,
  error,
}: CheckboxProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          aria-label={ariaLabel}
          id={inputId}
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={disabled}
          className={cn(
            "peer h-4 w-4 shrink-0 rounded border bg-surface-light",
            "checked:bg-accent checked:border-accent-strong",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            disabled && "opacity-50 cursor-not-allowed",
            error ? "border-danger-border" : "border-control-border",
            "appearance-none cursor-pointer transition-colors"
          )}
        />
        {checked && (
          <svg
            className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-on-accent"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="2 6 5 9 10 3" />
          </svg>
        )}
      </div>
      {label && (
        <div className="min-w-0">
          <label
            htmlFor={inputId}
            className={cn(
              "text-sm font-medium select-none",
              disabled ? "text-muted-darker cursor-not-allowed" : "text-foreground cursor-pointer"
            )}
          >
            {label}
          </label>
          {description && (
            <p className="text-xs text-muted-darker mt-0.5">{description}</p>
          )}
          {error && <p className="text-xs text-danger mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
