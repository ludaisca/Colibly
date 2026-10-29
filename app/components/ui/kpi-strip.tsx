import Link from "next/link";
import { cn } from "./cn";

// Franja KPI del layout workbench — grid de tarjetas con borde y sombra
// suave, cifra protagonista en font-display + tabular-nums. Server-safe por
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
      <p className="text-eyebrow font-medium uppercase tracking-wider text-muted-darker">
        {item.label}
      </p>
      <p className="flex items-baseline gap-2 flex-wrap">
        <span
          className={cn(
            "font-display font-extrabold tabular-nums tracking-tight text-foreground",
            hero ? "text-3xl" : "text-xl"
          )}
        >
          {item.value}
        </span>
        {item.delta && (
          <span className={cn("text-xs font-bold tabular-nums", DELTA_TONE[item.deltaTone ?? "neutral"])}>
            {item.delta}
          </span>
        )}
      </p>
      {item.hint && <p className="text-xs text-muted">{item.hint}</p>}
    </>
  );
}

interface KpiStripProps {
  items: KpiItem[];
  /** "hero" agranda las cifras (overviews); "compact" para contextos embebidos. */
  size?: "hero" | "compact";
  className?: string;
}

export function KpiStrip({ items, size = "hero", className }: KpiStripProps) {
  const hero = size === "hero";
  const desktopColumns = items.length === 5 ? "lg:grid-cols-5" : items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  const oddMobile = items.length % 2 === 1;
  return (
    <div
      className={cn(
        "grid gap-3 grid-cols-2",
        desktopColumns,
        className
      )}
    >
      {items.map((item) => {
        const inner = <KpiContent item={item} hero={hero} />;
        const cellClass = cn(
          "flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-4 shadow-sm transition-shadow",
          oddMobile && "last:col-span-2 lg:last:col-span-1",
        );
        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className={cn(cellClass, "hover:shadow-md hover:border-border")}
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
  );
}
