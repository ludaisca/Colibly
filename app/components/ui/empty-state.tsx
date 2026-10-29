import React from "react";
import { IconBox } from "./icon-box";
import { cn } from "./cn";

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-10 text-center gap-3", className)}>
      <IconBox icon={icon} size="xl" tone="accent" />
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description && <p className="text-sm text-muted max-w-sm">{description}</p>}
      </div>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}
