"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { cn } from "./cn";

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  error?: string;
  showErrorMessage?: boolean;
  showIcon?: boolean;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ error, showErrorMessage = false, showIcon = true, className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className={cn("relative", className)}>
        {showIcon && (
          <Lock
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-darker pointer-events-none"
          />
        )}
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          data-focus-ring=""
          aria-invalid={!!error}
          className={cn(
            "h-8 w-full rounded-sm border bg-surface py-1.5 text-sm text-foreground",
            "transition-colors placeholder:text-muted-darker",
            "focus:outline-none focus:border-accent-strong focus-visible:ring-2 focus-visible:ring-accent-subtle",
            showIcon ? "pl-9 pr-10" : "pl-3 pr-10",
            error ? "border-danger-border" : "border-border-strong"
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-darker hover:text-muted transition-colors"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        {error && showErrorMessage && (
          <p className="mt-1.5 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
