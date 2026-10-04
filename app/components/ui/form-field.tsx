import React, { useId } from "react";
import { cn } from "./cn";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: (id: string, describedBy?: string) => React.ReactNode;
}

// Añade aria-describedby (fusionado con el que ya traiga) y aria-required al
// control que devuelve la render-prop, sin tocar los que el llamador ya fijó.
// Un Fragment o un arreglo no admiten props: se devuelven tal cual.
function withFieldA11y(node: React.ReactNode, describedBy: string | undefined, required: boolean | undefined) {
  if (!React.isValidElement(node) || node.type === React.Fragment) return node;
  const props = node.props as Record<string, unknown>;
  const extra: Record<string, unknown> = {};
  if (describedBy) {
    const existing = typeof props["aria-describedby"] === "string" ? (props["aria-describedby"] as string) : "";
    const ids = new Set([...existing.split(" "), ...describedBy.split(" ")].filter(Boolean));
    extra["aria-describedby"] = [...ids].join(" ");
  }
  if (required && props["aria-required"] === undefined) extra["aria-required"] = true;
  return Object.keys(extra).length ? React.cloneElement(node as React.ReactElement<Record<string, unknown>>, extra) : node;
}

export function FormField({ label, required, error, hint, className, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <>
            <span className="ml-1 text-danger" aria-hidden="true">*</span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        )}
      </label>

      {withFieldA11y(children(id, describedBy), describedBy, required)}

      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-darker">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
