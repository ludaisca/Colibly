"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { CAMPAIGN_ORIGIN_LABEL } from "@/lib/whatsapp/export-columns";
import type { Estadisticas } from "@/lib/estadisticas/get-stats";

// Gráficas del módulo Estadísticas — Recharts (SVG, React-nativo, se integra
// con los tokens de color vía var(--...) directo en fill/stroke, así que no
// hace falta duplicar la paleta ni tocar esto cuando cambien los tokens en
// globals.css). accessibilityLayer viene activado por defecto en Recharts v3
// (foco por teclado + tooltip en focus, no solo hover).

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads platform state (matchMedia) unavailable during SSR, must sync on mount
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

const TICK_STYLE = { fontSize: 11, fill: "var(--muted-darker)" };

function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
  valueFormatter,
}: TooltipContentProps & {
  formatLabel?: (label: string) => string;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const sublabel = (payload[0]?.payload as { sublabel?: string } | undefined)?.sublabel;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-md">
      {label != null && (
        <p className="text-xs font-semibold text-foreground">
          {formatLabel ? formatLabel(String(label)) : label}
        </p>
      )}
      {sublabel && <p className="mb-1 font-mono text-micro text-muted-darker">{sublabel}</p>}
      <div className={sublabel ? "space-y-1" : "mt-1 space-y-1"}>
        {payload.map((entry, i) => (
          <div key={`${entry.dataKey}-${i}`} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color }} />
            <span className="text-muted">{entry.name}</span>
            <span className="ml-auto shrink-0 font-semibold tabular-nums">
              {valueFormatter && typeof entry.value === "number" ? valueFormatter(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MessagesTrendChart({ data }: { data: Estadisticas["dailyMessages"] }) {
  const reducedMotion = useReducedMotion();

  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/60 px-4 text-center">
        <p className="text-sm font-medium text-foreground">Aún no hay mensajes</p>
        <p className="mt-1 text-xs text-muted">La tendencia aparecerá cuando tus canales reciban conversaciones.</p>
      </div>
    );
  }

  const formatDay = (d: string, style: "short" | "long") =>
    new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
      day: "2-digit",
      month: style,
      ...(style === "long" ? { year: "numeric" as const } : {}),
    });

  return (
    <div>
      <p className="mb-3 text-xs text-muted-darker">
        <span className="font-semibold tabular-nums text-foreground">{total.toLocaleString("es-MX")}</span>{" "}
        {total === 1 ? "mensaje" : "mensajes"} en los últimos {data.length} {data.length === 1 ? "día" : "días"}
      </p>
      <div
        className="h-64 w-full"
        role="img"
        aria-label={`Gráfica de mensajes diarios de los últimos ${data.length} días, total ${total} ${total === 1 ? "mensaje" : "mensajes"}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="messagesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => formatDay(d, "short")}
              tick={TICK_STYLE}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tick={TICK_STYLE} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              cursor={{ stroke: "var(--accent-strong)", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={(props) => (
                <ChartTooltip {...props} formatLabel={(d) => formatDay(d, "long")} />
              )}
            />
            <Area
              type="monotone"
              dataKey="count"
              name="Mensajes"
              stroke="var(--accent-strong)"
              strokeWidth={2}
              fill="url(#messagesFill)"
              isAnimationActive={!reducedMotion}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface HBarDatum {
  id: string;
  label: string;
  value: number;
  sublabel?: string;
}

export function HorizontalBarChart({
  data,
  color = "var(--accent)",
  emptyLabel = "Sin datos todavía",
}: {
  data: HBarDatum[];
  color?: string;
  emptyLabel?: string;
}) {
  const reducedMotion = useReducedMotion();

  if (data.length === 0) {
    return <p className="py-5 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  const height = Math.max(data.length * 34, 64);

  return (
    <div
      style={{ height }}
      role="img"
      aria-label={data.map((d) => `${d.label}: ${d.value}`).join(", ")}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }} barCategoryGap={10}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={104}
            tick={TICK_STYLE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => (v.length > 15 ? `${v.slice(0, 14)}…` : v)}
          />
          <Tooltip cursor={{ fill: "var(--surface-light)" }} content={(props) => <ChartTooltip {...props} />} />
          <Bar
            dataKey="value"
            name="Total"
            fill={color}
            radius={[0, 6, 6, 0]}
            isAnimationActive={!reducedMotion}
            maxBarSize={18}
            label={{ position: "right", fill: "var(--muted-darker)", fontSize: 11 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DeliveryComparisonChart({ data }: { data: Estadisticas["campaignMessagesByOrigin"] }) {
  const reducedMotion = useReducedMotion();
  const hasData = data.some((d) => d.total > 0);

  if (!hasData) {
    return <p className="py-5 text-center text-sm text-muted">Sin envíos todavía</p>;
  }

  const chartData = data.map((d) => ({
    origin: CAMPAIGN_ORIGIN_LABEL[d.origin],
    Enviados: d.sent,
    Entregados: d.delivered,
    Leídos: d.read,
    Fallidos: d.failed,
  }));

  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label="Comparación de mensajes enviados, entregados, leídos y fallidos por origen de campaña"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={4}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="origin" tick={TICK_STYLE} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis allowDecimals={false} tick={TICK_STYLE} axisLine={false} tickLine={false} width={40} />
          <Tooltip cursor={{ fill: "var(--surface-light)" }} content={(props) => <ChartTooltip {...props} />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted-darker)" }} />
          <Bar dataKey="Enviados" fill="var(--muted-darker)" radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion} maxBarSize={28} />
          <Bar dataKey="Entregados" fill="var(--success)" radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion} maxBarSize={28} />
          <Bar dataKey="Leídos" fill="var(--info)" radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion} maxBarSize={28} />
          <Bar dataKey="Fallidos" fill="var(--danger)" radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Las etiquetas "frio"/"descartado" comparten tono neutral en el Badge (ver
// QUALIFIED_LABEL_BADGE en _view.tsx) — ahí no hace falta distinguirlas por
// color porque el texto de la etiqueta ya lo hace. En una dona el color ES el
// dato principal, así que aquí sí necesitan tonos distintos entre sí para no
// fundirse en una sola cuña visual.
const LABEL_TONE_COLOR: Record<string, string> = {
  prioridad_alta: "var(--danger)",
  oportunidad: "var(--success)",
  interesado: "var(--accent-strong)",
  frio: "var(--info)",
  descartado: "var(--muted-darker)",
};

export function QualifiedLabelDonut({
  data,
  labelText,
  total,
}: {
  data: Estadisticas["qualifiedChats"]["byLabel"];
  labelText: Record<string, string>;
  total: number;
}) {
  const reducedMotion = useReducedMotion();

  if (data.length === 0) {
    return <p className="py-5 text-center text-sm text-muted">Sin calificaciones todavía</p>;
  }

  const chartData = data.map((d) => ({
    name: labelText[d.label] ?? d.label,
    value: d.count,
    color: LABEL_TONE_COLOR[d.label] ?? "var(--muted-darker)",
  }));

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative h-28 w-28 shrink-0"
        role="img"
        aria-label={chartData.map((d) => `${d.name}: ${d.value}`).join(", ")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={(props) => <ChartTooltip {...props} />} />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={!reducedMotion}
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-lg font-bold tabular-nums">{total}</span>
          <span className="text-micro text-muted-darker">chats</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {chartData.map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="truncate text-muted">{d.name}</span>
            <span className="ml-auto shrink-0 font-semibold tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
