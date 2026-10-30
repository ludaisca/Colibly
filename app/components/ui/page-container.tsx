import React from "react";
import { cn } from "./cn";

// Contenedor único de páginas. Codifica la regla del design system:
// formularios y detalle se centran con max-w-2xl/3xl/4xl + mx-auto; las
// tablas y el chat usan "full" (sin límite). El AppShell ya aporta el padding
// exterior, así que aquí solo se controla el ancho y el ritmo vertical.
// No añadir paddings propios (p-*) para no duplicar la densidad del shell.

export type PageWidth = "2xl" | "3xl" | "4xl" | "full";

const WIDTH: Record<PageWidth, string> = {
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  full: "",
};

interface PageContainerProps {
  width?: PageWidth;
  className?: string;
  children: React.ReactNode;
}

export function PageContainer({ width = "3xl", className, children }: PageContainerProps) {
  return (
    <div
      className={cn(
        "w-full min-w-0 space-y-6",
        width !== "full" && `mx-auto ${WIDTH[width]}`,
        className
      )}
    >
      {children}
    </div>
  );
}
