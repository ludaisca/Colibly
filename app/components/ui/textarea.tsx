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
          aria-invalid={!!error}
          className={cn(
            "w-full rounded-lg border bg-surface-light px-3.5 py-2 text-sm text-foreground",
            "transition-colors placeholder:text-muted-darker resize-y min-h-[80px]",
            "focus:outline-none focus:border-accent-strong focus-visible:ring-2 focus-visible:ring-accent-muted",
            error ? "border-danger-border" : "border-border"
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
