import { cn } from "./cn";

// Layout editorial de los overviews (sustituye a BentoGrid): una columna
// principal ancha (actividad, gráficas, tablas) y un aside angosto (acciones
// rápidas, presupuesto, salud). Server-safe. Colapsa a 1 columna bajo lg.
//
// `ruled` (Estadísticas, Reportes; dirección congelada nov 2026): una sola
// superficie con las dos columnas separadas por un filete y las secciones
// (WorkbenchSection) por filetes horizontales — sin tarjeta dentro de tarjeta.

export function Workbench({ children, className, ruled = false }: { children: React.ReactNode; className?: string; ruled?: boolean }) {
  return (
    <div
      data-ruled={ruled || undefined}
      className={cn(
        "group/workbench grid lg:grid-cols-3",
        ruled ? "overflow-hidden rounded-lg border border-border bg-surface" : "gap-6",
        className
      )}
    >
      {children}
    </div>
  );
}

export function WorkbenchMain({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 lg:col-span-2 space-y-6 group-data-[ruled]/workbench:space-y-0 group-data-[ruled]/workbench:divide-y group-data-[ruled]/workbench:divide-border", className)}>
      {children}
    </div>
  );
}

export function WorkbenchAside({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "min-w-0 space-y-6 group-data-[ruled]/workbench:space-y-0 group-data-[ruled]/workbench:divide-y group-data-[ruled]/workbench:divide-border",
        "group-data-[ruled]/workbench:border-t group-data-[ruled]/workbench:border-border lg:group-data-[ruled]/workbench:border-l lg:group-data-[ruled]/workbench:border-t-0",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Sección de un Workbench `ruled`: sin borde propio, separada por filetes. */
export function WorkbenchSection({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("min-w-0 p-4 md:p-5", className)}>{children}</section>;
}
