import React from "react";
import { cn } from "./cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ElementType;
  error?: string;
  showErrorMessage?: boolean;
  inputClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ icon: Icon, error, showErrorMessage = false, className, inputClassName, ...props }, ref) => {
    return (
      <div className={cn("relative", className)}>
        {Icon && (
          <Icon
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-darker pointer-events-none"
          />
        )}
        <input
          ref={ref}
          data-focus-ring=""
          aria-invalid={!!error}
          className={cn(
            "h-8 w-full rounded-sm border bg-surface py-1.5 text-sm text-foreground",
            "transition-colors placeholder:text-subtle",
            // Campo blanco con borde --border-strong; foco: borde acento + anillo 2 px
            // --accent-subtle. Gris solo deshabilitado.
            "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-subtle disabled:bg-surface-light disabled:text-muted",
            Icon ? "pl-9 pr-3" : "px-3",
            error
              ? "border-danger-border focus:border-danger"
              : "border-border-strong",
            inputClassName
          )}
          {...props}
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
Input.displayName = "Input";
