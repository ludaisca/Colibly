import Link from "next/link";
import { Card as AxCard } from "@astryxdesign/core/Card";
import { cn } from "./cn";

// Franja KPI (dirección congelada, nov 2026): UNA superficie con divisores
// (gap-px sobre el filete), etiqueta text-xs 500 en minúscula, cifra
// text-figure y una línea de contexto. Con ceros conserva la estructura. Server-safe por
// diseño — al no aceptar iconos como props, los RSC (dashboard, hub
// WhatsApp) la usan directo sin chocar con la regla "no pasar componentes
// Lucide a client".

export interface KpiItem {
  label: string;
  /** Cifra ya formateada por el caller (es-MX, unidades, "1/1", "$0.42"…). */
  value: string;
  /** Variación o dato secundario junto al valor, p. ej. "+12%" o "3 sin leer". */
  delta?: string;
  deltaTone?: "success" | "danger" | "neutral";
  /** Texto pequeño bajo el label, p. ej. "conectadas". */
  hint?: string;
  href?: string;
}

const DELTA_TONE: Record<"success" | "danger" | "neutral", string> = {
  success: "text-success",
  danger: "text-danger",
  neutral: "text-muted-darker",
};

function KpiContent({ item, hero }: { item: KpiItem; hero: boolean }) {
  return (
    <>
      <p className="text-xs text-muted">{item.label}</p>
      <p className="flex items-baseline gap-2 flex-wrap">
        <span className={cn("text-figure text-foreground", !hero && "text-xl leading-7")}>
          {item.value}
        </span>
        {item.delta && (
          <span className={cn("text-xs font-medium tabular-nums", DELTA_TONE[item.deltaTone ?? "neutral"])}>
            {item.delta}
          </span>
        )}
      </p>
      {item.hint && <p className="text-xs text-muted-darker">{item.hint}</p>}
    </>
  );
}

interface KpiStripProps {
  items: KpiItem[];
  /** "hero" agranda las cifras (overviews); "compact" para contextos embebidos. */
  size?: "hero" | "compact";
  className?: string;
  /** Fuerza columnas en desktop (p. ej. 2 dentro de un contenedor 4XL). */
  columns?: 2 | 3 | 4 | 5;
}

const DESKTOP_COLUMNS: Record<2 | 3 | 4 | 5, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
};

export function KpiStrip({ items, size = "hero", className, columns }: KpiStripProps) {
  const hero = size === "hero";
  const desktopColumns = columns
    ? DESKTOP_COLUMNS[columns]
    : items.length === 5
      ? "lg:grid-cols-5"
      : items.length === 3
        ? "lg:grid-cols-3"
        : "lg:grid-cols-4";
  const oddMobile = items.length % 2 === 1;
  // Astryx no trae un componente de cifras: la superficie es su Card y dentro
  // va la cuadrícula con divisores de siempre (gap-px sobre el filete).
  return (
    <AxCard padding={0} className={cn("overflow-hidden", className)}>
    <div className={cn("grid grid-cols-2 gap-px bg-border", desktopColumns)}>
      {items.map((item) => {
        const inner = <KpiContent item={item} hero={hero} />;
        const cellClass = cn(
          "flex flex-col gap-1 bg-surface px-4 py-3 transition-colors",
          oddMobile && "last:col-span-2 lg:last:col-span-1",
        );
        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className={cn(cellClass, "hover:bg-surface-light")}
          >
            {inner}
          </Link>
        ) : (
          <div key={item.label} className={cellClass}>
            {inner}
          </div>
        );
      })}
    </div>
    </AxCard>
  );
}
