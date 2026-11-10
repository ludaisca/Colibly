import React from "react";
import { cn } from "./cn";
import { HelpHint } from "./help-hint";
import type { GlossaryKey } from "@/lib/help/glossary";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Término del glosario: pone un (i) "¿Qué es esto?" junto al título. */
  hint?: GlossaryKey;
  className?: string;
}

export function PageHeader({ title, description, actions, hint, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3", className)}>
      <div>
        <h1 className="font-display text-page-title font-semibold tracking-tight">
          {title}
          {hint && <HelpHint term={hint} className="ml-1 align-middle" />}
        </h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
