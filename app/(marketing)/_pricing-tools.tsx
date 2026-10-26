"use client";

import { useId, useMemo, useState } from "react";
import { Check, Minus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/components/ui/cn";
import {
  formatMxn,
  limitsForSeats,
  maxSeatsFor,
  MIN_SEATS,
  monthlyTotalMxn,
  PLAN_LIST,
  PLANS,
  type PlanId,
} from "@/lib/billing/plans";
import { planCompareRows, type PlanCompareCell } from "@/lib/billing/plan-features";

const DEFAULT_PLAN: PlanId = "PRO";
const DEFAULT_SEATS = 3;
/** Tope del control en marketing: suficiente para equipos reales sin un slider de 100. */
const LANDING_SEAT_CAP = 20;

function CellValue({ value, className }: { value: PlanCompareCell; className?: string }) {
  if (value === true) {
    return <Check size={16} className={cn("text-accent-ink", className)} aria-label="Incluido" />;
  }
  if (value === false) {
    return <Minus size={16} className={cn("text-muted", className)} aria-label="No incluido" />;
  }
  return <span className={cn("tabular-nums", className)}>{value}</span>;
}

function SeatCalculator({ registerCta }: { registerCta: string }) {
  const seatsId = useId();
  const [planId, setPlanId] = useState<PlanId>(DEFAULT_PLAN);
  const plan = PLANS[planId];
  const maxSeats = Math.min(LANDING_SEAT_CAP, maxSeatsFor(plan));
  const [seats, setSeats] = useState(Math.min(DEFAULT_SEATS, maxSeats));

  const clampedSeats = Math.min(maxSeats, Math.max(MIN_SEATS, seats));
  const total = monthlyTotalMxn(plan, clampedSeats);
  const limits = limitsForSeats(plan, clampedSeats);

  function selectPlan(id: PlanId) {
    const next = PLANS[id];
    const nextMax = Math.min(LANDING_SEAT_CAP, maxSeatsFor(next));
    setPlanId(id);
    setSeats((n) => Math.min(nextMax, Math.max(MIN_SEATS, n)));
  }

  const poolLines = [
    `${limits.whatsapp} ${limits.whatsapp === 1 ? "WhatsApp" : "números WhatsApp"}`,
    `${limits.contacts.toLocaleString("es-MX")} contactos`,
    plan.perOrg.aiAccess
      ? `${limits.aiCreditsPerMonth.toLocaleString("es-MX")} créditos IA/mes`
      : null,
  ].filter(Boolean) as string[];

  return (
    <section
      aria-labelledby={`${seatsId}-title`}
      className="overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <div className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <h3 id={`${seatsId}-title`} className="font-display text-lg font-semibold tracking-tight sm:text-xl">
          Calcula tu equipo
        </h3>
        <p className="mt-1 text-sm text-muted">Elige plan y ejecutivos. El total se actualiza al instante.</p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
        <div className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">
          <div role="radiogroup" aria-label="Plan" className="grid grid-cols-3 gap-1.5 min-[400px]:gap-2">
            {PLAN_LIST.map((p) => {
              const active = p.id === planId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => selectPlan(p.id)}
                  className={cn(
                    "flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition-colors min-[400px]:px-1.5 sm:min-h-16 sm:px-2",
                    active
                      ? "border-accent-strong bg-accent-subtle text-accent-ink ring-1 ring-accent-strong"
                      : "border-border bg-background text-foreground hover:border-accent-muted"
                  )}
                >
                  <span className="font-display text-xs font-semibold min-[400px]:text-sm sm:text-base">{p.name}</span>
                  <span className="mt-0.5 text-[10px] tabular-nums text-muted min-[400px]:text-[11px] sm:text-xs">
                    {formatMxn(p.pricePerSeatMxn)}
                    <span className="hidden sm:inline">/ejec.</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={seatsId} className="text-sm font-medium text-foreground">
                Ejecutivos
              </label>
              <span className="font-display text-2xl font-semibold tabular-nums sm:text-3xl" aria-live="polite">
                {clampedSeats}
              </span>
            </div>
            <input
              id={seatsId}
              type="range"
              min={MIN_SEATS}
              max={maxSeats}
              value={clampedSeats}
              onChange={(e) => setSeats(Number(e.target.value))}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-border accent-[var(--accent-strong)]"
              aria-valuemin={MIN_SEATS}
              aria-valuemax={maxSeats}
              aria-valuenow={clampedSeats}
              aria-valuetext={`${clampedSeats} ${clampedSeats === 1 ? "ejecutivo" : "ejecutivos"}`}
            />
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>{MIN_SEATS}</span>
              <span>
                hasta {maxSeats}
                {maxSeatsFor(plan) > LANDING_SEAT_CAP ? "+" : ""}
              </span>
            </div>
          </div>

          <p className="text-pretty text-sm leading-relaxed text-muted">
            {plan.name} · {poolLines.join(" · ")}
            {planId === "ESSENTIAL" ? " · tope 3 ejecutivos" : null}
            {maxSeatsFor(plan) > LANDING_SEAT_CAP ? " · más de 20 al registrarte" : null}
          </p>
        </div>

        <div className="flex flex-col justify-between gap-4 border-t border-border bg-background/70 px-4 py-5 sm:px-6 sm:py-6 lg:border-l lg:border-t-0">
          <div className="min-w-0">
            <p className="text-sm text-muted">Total al mes</p>
            <p className="mt-1 break-words font-display text-[clamp(2rem,10vw,3rem)] font-semibold tabular-nums tracking-tight sm:text-5xl">
              {formatMxn(total)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted sm:text-sm">
              {formatMxn(plan.pricePerSeatMxn)} × {clampedSeats}{" "}
              {clampedSeats === 1 ? "ejecutivo" : "ejecutivos"} · MXN
            </p>
          </div>
          <Button
            href="/register"
            size="lg"
            fullWidth
            data-track="cta"
            data-track-location="pricing_calculator"
          >
            {registerCta}
          </Button>
        </div>
      </div>
    </section>
  );
}

function PlanCompareMatrix() {
  const titleId = useId();
  const rows = useMemo(() => planCompareRows(), []);
  const [diffOnly, setDiffOnly] = useState(false);
  const [selected, setSelected] = useState<PlanId>(DEFAULT_PLAN);

  const visible = diffOnly
    ? rows.filter((row) => {
        const vals = PLAN_LIST.map((p) => String(row.values[p.id]));
        return new Set(vals).size > 1;
      })
    : rows;

  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <div className="min-w-0">
          <h3 id={titleId} className="font-display text-lg font-semibold tracking-tight sm:text-xl">
            Compara planes
          </h3>
          <p className="mt-1 text-sm text-muted">Misma fuente que las tarjetas de arriba.</p>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:self-auto">
          <input
            type="checkbox"
            role="switch"
            checked={diffOnly}
            onChange={(e) => setDiffOnly(e.target.checked)}
            className="size-4 rounded border-border accent-[var(--accent-strong)]"
          />
          Solo diferencias
        </label>
      </div>

      {/* Móvil: etiqueta a ancho completo + 3 columnas de valores (evita texto ilegible) */}
      <div className="md:hidden">
        <div className="grid grid-cols-3 gap-px border-b border-border bg-border">
          {PLAN_LIST.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              className={cn(
                "bg-surface-light px-1 py-2.5 text-center text-[11px] font-semibold leading-tight min-[400px]:text-xs",
                p.id === selected ? "bg-accent-subtle text-accent-ink" : "text-foreground"
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-border">
          {visible.map((row) => (
            <li key={row.id} className="bg-surface">
              <p className="px-3 pt-3 text-xs font-medium leading-snug text-foreground">{row.label}</p>
              <div className="mt-2 grid grid-cols-3 gap-px bg-border pb-px">
                {PLAN_LIST.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex min-h-10 items-center justify-center bg-surface px-1 py-2.5 text-center text-[11px] leading-snug",
                      p.id === selected && "bg-accent-subtle/50"
                    )}
                  >
                    <CellValue value={row.values[p.id]} />
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Escritorio: tabla completa */}
      <div className="hidden md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-light/80">
              <th scope="col" className="w-[32%] px-6 py-3.5 text-left font-medium text-muted-strong">
                Función
              </th>
              {PLAN_LIST.map((p) => {
                const active = p.id === selected;
                return (
                  <th key={p.id} scope="col" className="px-3 py-3.5 text-center font-medium">
                    <button
                      type="button"
                      onClick={() => setSelected(p.id)}
                      className={cn(
                        "inline-flex w-full max-w-[9rem] flex-col items-center rounded-lg px-2 py-2 transition-colors",
                        active ? "bg-accent-subtle text-accent-ink" : "text-foreground hover:bg-background"
                      )}
                    >
                      <span className="font-display text-base font-semibold">{p.name}</span>
                      {p.badge ? <span className="mt-0.5 text-[11px] font-medium opacity-80">{p.badge}</span> : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-6 py-3.5 text-left font-medium text-foreground">
                  <span>{row.label}</span>
                  {row.hint ? (
                    <span className="mt-0.5 block text-xs font-normal text-muted">{row.hint}</span>
                  ) : null}
                </th>
                {PLAN_LIST.map((p) => (
                  <td
                    key={p.id}
                    className={cn(
                      "px-3 py-3.5 text-center text-foreground",
                      p.id === selected && "bg-accent-subtle/40"
                    )}
                  >
                    <span className="inline-flex min-h-6 items-center justify-center">
                      <CellValue value={row.values[p.id]} />
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Calculadora de asientos + matriz de comparación (patrones de Tesela, marca Laguna). */
export function PricingTools({ registerCta }: { registerCta: string }) {
  return (
    <div className="mt-10 space-y-5 sm:mt-12 sm:space-y-6">
      <SeatCalculator registerCta={registerCta} />
      <PlanCompareMatrix />
    </div>
  );
}
