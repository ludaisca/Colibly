import React from "react";
import { cn } from "./cn";

type Padding = "none" | "sm" | "md" | "lg";

const PAD: Record<Padding, string> = {
  none: "",
  sm:   "p-4",
  md:   "p-5",
  lg:   "p-6",
};

interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, "className" | "children"> {
  padding?: Padding;
  interactive?: boolean;
  className?: string;
  children: React.ReactNode;
  as?: React.ElementType;
}

export function Card({ padding = "md", interactive = false, className, children, as: Tag = "div", ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-xl border border-border bg-surface",
        PAD[padding],
        interactive && "transition-shadow cursor-pointer hover:shadow-md hover:border-border",
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 mb-4", className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  as: Tag = "h3",
}: {
  className?: string;
  children: React.ReactNode;
  /** Nivel de encabezado: h3 por defecto; las páginas que lo usan como título principal pasan "h1". */
  as?: "h1" | "h2" | "h3" | "h4";
}) {
  return (
    <Tag className={cn("text-base font-semibold tracking-tight text-foreground", className)}>
      {children}
    </Tag>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("", className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("mt-4 pt-4 border-t border-border flex items-center gap-3", className)}>
      {children}
    </div>
  );
}
