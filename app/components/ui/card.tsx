import React from "react";
import { cn } from "./cn";

type Padding = "none" | "sm" | "md" | "lg";

const PAD: Record<Padding, string> = {
  none: "",
  sm:   "p-3",
  md:   "p-4",
  lg:   "p-5",
};

interface CardProps {
  padding?: Padding;
  interactive?: boolean;
  className?: string;
  children: React.ReactNode;
  as?: React.ElementType;
  [key: string]: unknown;
}

export function Card({ padding = "md", interactive = false, className, children, as: Tag = "div", ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-lg border border-border bg-surface",
        PAD[padding],
        interactive && "transition-colors cursor-pointer hover:bg-surface-light",
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
    <div className={cn("flex items-center justify-between gap-3 mb-3", className)}>
      {children}
    </div>
  );
}

// `as` cambia solo el nivel del encabezado (p. ej. "h1" cuando la tarjeta es
// el contenido principal de la página, como en las de acceso); el aspecto no cambia.
export function CardTitle({ className, children, as: Tag = "h3" }: { className?: string; children: React.ReactNode; as?: "h1" | "h2" | "h3" }) {
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
    <div className={cn("mt-3 pt-3 border-t border-border flex items-center gap-3", className)}>
      {children}
    </div>
  );
}
