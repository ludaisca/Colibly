import React from "react";
import { Card as AxCard } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { cn } from "./cn";

// Adaptador (rediseño con Astryx): misma API de siempre, superficie del Card de
// Astryx. Server-safe: no recibe funciones. `as` (section, aside) conserva la
// semántica envolviendo la tarjeta en ese elemento sin caja propia.

type Padding = "none" | "sm" | "md" | "lg";

const PAD = { none: 0, sm: 3, md: 4, lg: 5 } as const;

interface CardProps {
  padding?: Padding;
  interactive?: boolean;
  className?: string;
  children: React.ReactNode;
  as?: React.ElementType;
  [key: string]: unknown;
}

export function Card({ padding = "md", interactive = false, className, children, as: Tag = "div", ...rest }: CardProps) {
  const card = (
    <AxCard
      padding={PAD[padding]}
      className={cn(interactive && "cursor-pointer transition-colors hover:bg-surface-light", className)}
      {...(Tag === "div" ? rest : {})}
    >
      {children}
    </AxCard>
  );
  if (Tag === "div") return card;
  return (
    <Tag className="contents" {...rest}>
      {card}
    </Tag>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>{children}</div>;
}

// `as` cambia solo el nivel del encabezado (h1 en las tarjetas de acceso); el aspecto no cambia.
export function CardTitle({ className, children, as = "h3" }: { className?: string; children: React.ReactNode; as?: "h1" | "h2" | "h3" }) {
  const level = Number(as.slice(1)) as 1 | 2 | 3;
  return (
    <Heading level={3} accessibilityLevel={level} className={className}>
      {children}
    </Heading>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mt-3 flex items-center gap-3 border-t border-border pt-3", className)}>{children}</div>;
}
