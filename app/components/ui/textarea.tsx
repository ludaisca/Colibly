import React from "react";
import { cn } from "./cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  showErrorMessage?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, showErrorMessage = false, className, ...props }, ref) => {
    return (
      <div className={cn("relative", className)}>
        <textarea
          ref={ref}
          data-focus-ring=""
          aria-invalid={!!error}
          className={cn(
            "w-full rounded-sm border bg-surface px-3 py-2 text-sm text-foreground",
            "transition-colors placeholder:text-subtle resize-y min-h-[80px]",
            // Campo blanco con borde --border-strong; foco: borde acento + anillo 2 px
            // --accent-subtle. Gris solo deshabilitado.
            "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-subtle disabled:bg-surface-light disabled:text-muted",
            error ? "border-danger-border" : "border-border-strong"
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
Textarea.displayName = "Textarea";
