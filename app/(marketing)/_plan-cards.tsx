"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/cn";
import {
  formatMxn,
  PLAN_LIST,
  PRICE_TAX_NOTE,
  PRICE_UNIT,
  type PlanId,
} from "@/lib/billing/plans";
import { planFeatures } from "@/lib/billing/plan-features";
import { FeatureHint } from "./_feature-hint";

const FEATURED: PlanId = "PRO";

function PlanCard({
  planId,
  cta,
  trackLocation,
  titleAs: Title = "h3",
}: {
  planId: PlanId;
  cta: string;
  trackLocation: string;
  titleAs?: "h2" | "h3";
}) {
  const plan = PLAN_LIST.find((p) => p.id === planId)!;
  const featured = plan.id === FEATURED;

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col rounded-2xl border p-4 min-[400px]:p-5 sm:p-6",
        featured
          ? "border-accent-strong bg-accent-subtle/60 ring-1 ring-accent-strong"
          : "border-border bg-surface"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Title className="min-w-0 font-display text-xl font-semibold">{plan.name}</Title>
        {plan.badge ? (
          <Badge tone="accent" size="sm" className="shrink-0">
            {plan.badge}
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 text-pretty text-sm text-muted">{plan.tagline}</p>
      <p className="mt-5">
        <span className="font-display text-[clamp(2rem,9vw,2.75rem)] leading-none tabular-nums sm:text-hero">
          {formatMxn(plan.pricePerSeatMxn)}
        </span>
        <span className="mt-1 block text-pretty text-sm text-muted">
          {PRICE_UNIT}
          {PRICE_TAX_NOTE ? ` · ${PRICE_TAX_NOTE}` : ""}
        </span>
      </p>
      <ul className="mt-5 flex-1 space-y-2.5 text-sm">
        {planFeatures(plan).map((f) => (
          <li key={f.text} className={cn("flex list-none items-start gap-2", !f.included && "text-muted")}>
            {f.included ? (
              <Check size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
            ) : (
              <X size={16} className="mt-0.5 shrink-0" aria-hidden />
            )}
            <span className="min-w-0">
              {!f.included && <span className="sr-only">No incluye: </span>}
              <FeatureHint text={f.text} hint={f.hint} muted={!f.included} />
            </span>
          </li>
        ))}
      </ul>
      <Button
        href="/register"
        variant={featured ? "primary" : "secondary"}
        size="lg"
        fullWidth
        className="mt-6"
        data-track="cta"
        data-track-location={trackLocation}
      >
        {cta}
      </Button>
    </div>
  );
}

/** Tres planes: carrusel con snap en &lt; lg, grid en escritorio. */
export function PlanCards({
  cta,
  trackPrefix,
  titleAs = "h3",
  className,
}: {
  cta: string;
  /** Prefijo de `data-track-location` (p. ej. `plan` → `plan_pro`). */
  trackPrefix: string;
  /** En /precios el título de cada card es h2. */
  titleAs?: "h2" | "h3";
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => PLAN_LIST.findIndex((p) => p.id === FEATURED));

  const syncActive = useCallback(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const mid = root.scrollLeft + root.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < root.children.length; i++) {
      const el = root.children[i] as HTMLElement;
      const center = el.offsetLeft + el.offsetWidth / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setActive(best);
  }, []);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    syncActive();
    root.addEventListener("scroll", syncActive, { passive: true });
    const ro = new ResizeObserver(syncActive);
    ro.observe(root);
    return () => {
      root.removeEventListener("scroll", syncActive);
      ro.disconnect();
    };
  }, [syncActive]);

  // Arranca centrado en Pro (el plan destacado).
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const featuredIdx = PLAN_LIST.findIndex((p) => p.id === FEATURED);
    const slide = root.children[featuredIdx] as HTMLElement | undefined;
    if (!slide) return;
    const left = slide.offsetLeft - (root.clientWidth - slide.offsetWidth) / 2;
    root.scrollTo({ left: Math.max(0, left) });
  }, []);

  function goTo(i: number) {
    const root = scrollerRef.current;
    const slide = root?.children[i] as HTMLElement | undefined;
    if (!root || !slide) return;
    const left = slide.offsetLeft - (root.clientWidth - slide.offsetWidth) / 2;
    root.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }

  return (
    <div className={cn(className)}>
      {/* Móvil / tablet: carrusel */}
      <div className="lg:hidden">
        <div
          ref={scrollerRef}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-roledescription="carrusel"
          aria-label="Planes"
        >
          {PLAN_LIST.map((plan, i) => (
            <div
              key={plan.id}
              className="w-[min(20.5rem,calc(100vw-3.25rem))] shrink-0 snap-center"
              aria-current={i === active ? "true" : undefined}
            >
              <PlanCard
                planId={plan.id}
                cta={cta}
                trackLocation={`${trackPrefix}_${plan.id.toLowerCase()}`}
                titleAs={titleAs}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2" role="tablist" aria-label="Planes">
          {PLAN_LIST.map((plan, i) => (
            <button
              key={plan.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={plan.name}
              className={cn(
                "h-2 rounded-full transition-all",
                i === active ? "w-6 bg-accent-strong" : "w-2 bg-border hover:bg-muted"
              )}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-muted-strong" aria-live="polite">
          {PLAN_LIST[active]?.name}
          {active < PLAN_LIST.length - 1 ? " · desliza para ver más" : null}
        </p>
      </div>

      {/* Escritorio: grid */}
      <div className="hidden gap-5 lg:grid lg:grid-cols-3">
        {PLAN_LIST.map((plan) => (
          <PlanCard
            key={plan.id}
            planId={plan.id}
            cta={cta}
            trackLocation={`${trackPrefix}_${plan.id.toLowerCase()}`}
            titleAs={titleAs}
          />
        ))}
      </div>
    </div>
  );
}
