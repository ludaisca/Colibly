import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  showErrorMessage?: boolean;
  placeholder?: string;
  /** Versión compacta (32 px, texto xs) para tarjetas y filas densas. */
  compact?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, showErrorMessage = false, placeholder, compact = false, className, children, ...props }, ref) => {
    return (
      <div className={cn("relative", className)}>
        <select
          ref={ref}
          data-focus-ring=""
          aria-invalid={!!error}
          className={cn(
            "w-full appearance-none rounded-sm border bg-surface text-foreground",
            compact ? "h-7 pl-2 pr-7 text-xs" : "h-8 pl-3 pr-9 text-sm",
            "transition-colors",
            // Campo blanco con borde --border-strong; foco: borde acento + anillo 2 px
            // --accent-subtle. Gris solo deshabilitado.
            "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-subtle disabled:bg-surface-light disabled:text-muted",
            error ? "border-danger-border" : "border-border-strong"
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <ChevronDown
          size={compact ? 14 : 16}
          aria-hidden
          className={cn("absolute top-1/2 -translate-y-1/2 text-muted-darker pointer-events-none", compact ? "right-2" : "right-3")}
        />
        {error && showErrorMessage && (
          <p className="mt-1 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";
