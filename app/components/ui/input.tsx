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
            "w-full rounded-[9px] border bg-surface-light py-2 text-sm text-foreground",
            "transition-colors placeholder:text-muted-darker",
            "focus:outline-none focus:border-accent-strong focus-visible:ring-2 focus-visible:ring-accent-muted",
            Icon ? "pl-9 pr-3" : "px-3",
            error
              ? "border-danger-border focus:border-danger"
              : "border-border",
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
