"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { GoogleSheetsIcon, MetaIcon } from "@/app/components/ui/brand-marks";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/components/ui/cn";
import { META_FEES_NOTE } from "@/lib/billing/plan-features";
import { formatMxn } from "@/lib/billing/plans";
import {
  LANDING_PLANS,
  OFFER_GROUPS,
  type LandingPlan,
  type OfferCell,
} from "./_landing-offer-data";

function FeatureLabel({ label }: { label: string }) {
  if (label === "Google Sheets y fuentes de leads") {
    return <span className="inline-flex items-center gap-2"><GoogleSheetsIcon size={16} className="shrink-0" />{label}</span>;
  }
  if (label === "Formularios y conversiones de Meta Ads") {
    return <span className="inline-flex items-center gap-2"><MetaIcon size={16} className="shrink-0" />{label}</span>;
  }
  return label;
}

function CellValue({ value }: { value: OfferCell }) {
  if (value === true) {
    return <Check size={16} className="mx-auto text-accent-ink" aria-label="Incluido" />;
  }
  if (value === false) {
    return <span className="text-muted" aria-label="No incluido">—</span>;
  }
  return <span className="text-pretty text-xs leading-snug sm:text-sm">{value}</span>;
}

function PlanCard({ plan, cta, registerHref }: { plan: LandingPlan; cta: string; registerHref: string }) {
  const custom = plan.priceMxn == null;
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col rounded-2xl border p-4 min-[400px]:p-5 sm:p-6",
        plan.featured ? "border-foreground bg-surface ring-1 ring-foreground" : "border-border bg-surface"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 font-display text-xl font-semibold">{plan.name}</h3>
        {plan.featured ? (
          <span className="shrink-0 rounded-full bg-foreground px-2 py-0.5 text-micro font-semibold text-background">
            Recomendado
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-pretty text-sm text-muted">{plan.tagline}</p>
      <p className="mt-5">
        <span
          className={cn(
            "font-display leading-none",
            custom ? "text-3xl sm:text-4xl" : "text-[clamp(2rem,9vw,2.75rem)] tabular-nums sm:text-hero"
          )}
        >
          {custom ? "A la medida" : formatMxn(plan.priceMxn!)}
        </span>
        <span className="mt-1 block text-pretty text-sm text-muted">
          {custom ? "Según tu configuración" : "MXN por usuario al mes"}
        </span>
      </p>
      <p className="mt-2 text-pretty text-xs text-muted">
        {custom ? "El costo depende de tu configuración. Escríbenos." : "Pago mensual. Cancelas cuando quieras."}
      </p>
      <ul className="mt-5 flex-1 space-y-2.5 text-sm">
        <li className="font-medium">{plan.leads}</li>
        <li className="font-medium">{plan.credits}</li>
        <li className="text-pretty text-muted">{plan.channels}</li>
        {plan.includes.map((line) =>
          line.endsWith(", más:") ? (
            <li key={line} className="text-pretty text-muted">{line}</li>
          ) : (
            <li key={line} className="flex items-start gap-2">
              <Check size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
              <span className="min-w-0 text-pretty">{line}</span>
            </li>
          )
        )}
      </ul>
      <Button
        // Registro absoluto al host de la app: un <Link> relativo a /register en
        // colibly.com se precargaba, seguía la redirección y rompía la CSP.
        href={custom ? "/contacto" : registerHref}
        variant={plan.featured ? "primary" : "secondary"}
        size="lg"
        fullWidth
        className="mt-6"
        data-track="cta"
        data-track-location={`plan_${plan.id}`}
      >
        {custom ? "Hablar con nosotros" : cta}
      </Button>
    </div>
  );
}

function PlanCarousel({ cta, registerHref }: { cta: string; registerHref: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const initial = Math.max(0, LANDING_PLANS.findIndex((p) => p.featured));
  const [active, setActive] = useState(initial);

  const syncActive = useCallback(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const mid = root.scrollLeft + root.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < root.children.length; i++) {
      const el = root.children[i] as HTMLElement;
      const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
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

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || root.clientWidth === 0) return;
    const slide = root.children[initial] as HTMLElement | undefined;
    if (!slide) return;
    root.scrollTo({ left: Math.max(0, slide.offsetLeft - (root.clientWidth - slide.offsetWidth) / 2) });
  }, [initial]);

  function goTo(i: number) {
    const root = scrollerRef.current;
    const slide = root?.children[i] as HTMLElement | undefined;
    if (!root || !slide) return;
    root.scrollTo({ left: Math.max(0, slide.offsetLeft - (root.clientWidth - slide.offsetWidth) / 2), behavior: "smooth" });
  }

  return (
    <div className="mt-10 xl:hidden sm:mt-12">
      <div className="relative">
        <div
          ref={scrollerRef}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-roledescription="carrusel"
          aria-label="Planes"
        >
          {LANDING_PLANS.map((plan, i) => (
            <div
              key={plan.id}
              className="w-[min(20.5rem,calc(100vw-3.25rem))] shrink-0 snap-center"
              aria-current={i === active ? "true" : undefined}
            >
              <PlanCard plan={plan} cta={cta} registerHref={registerHref} />
            </div>
          ))}
        </div>
      </div>
      {/* Antes eran puntos de 8 px (objetivo táctil insuficiente): ahora el
          nombre de cada plan, con la selección en tinta como en el panel. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5" aria-label="Ir al plan">
        {LANDING_PLANS.map((plan, i) => (
          <button
            key={plan.id}
            type="button"
            aria-pressed={i === active}
            className={cn(
              "min-h-10 rounded-full px-3.5 text-sm font-medium transition-colors",
              i === active ? "bg-foreground text-background" : "bg-surface-light text-muted-darker hover:text-foreground"
            )}
            onClick={() => goTo(i)}
          >
            {plan.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function CompareTable() {
  const [planIndex, setPlanIndex] = useState(() => Math.max(0, LANDING_PLANS.findIndex((p) => p.featured)));

  return (
    <div id="comparar" className="scroll-mt-24">
      <h3 className="text-balance text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        Compara los planes
      </h3>
      <p className="mx-auto mt-3 max-w-2xl text-pretty text-center text-sm text-muted">
        Los créditos de IA se multiplican por el número de usuarios y los que no usas no pasan al mes siguiente.
      </p>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 lg:hidden" role="tablist" aria-label="Plan a comparar">
        {LANDING_PLANS.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={i === planIndex}
            className={cn(
              "min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium",
              i === planIndex ? "bg-foreground text-background" : "text-muted-darker hover:text-foreground"
            )}
            onClick={() => setPlanIndex(i)}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="mt-4 lg:hidden">
        {OFFER_GROUPS.map((group) => (
          <div key={group.title} className="border-b border-border py-4">
            <h4 className="font-display text-lg font-semibold">{group.title}</h4>
            <ul className="mt-2 divide-y divide-border">
              {group.items.map((item) =>
                item.kind === "sub" ? (
                  <li key={item.label} className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    {item.label}
                  </li>
                ) : (
                  <li key={item.label} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 text-pretty"><FeatureLabel label={item.label} /></span>
                    <span className="max-w-[46%] shrink-0 text-right font-medium">
                      <CellValue value={item.cells[planIndex] ?? false} />
                    </span>
                  </li>
                )
              )}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-8 hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
          <caption className="sr-only">Comparación de planes Básico, Avanzado, Pro y Empresarial</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="sticky left-0 bg-background py-3 pr-4 font-medium">
                Función
              </th>
              {LANDING_PLANS.map((item) => (
                <th key={item.id} scope="col" className={cn("px-3 py-3 text-center font-display text-base", item.featured && "underline decoration-2 underline-offset-4")}>
                  {item.name}
                  <span className="mt-1 block text-xs font-sans font-normal text-muted">
                    {item.priceMxn == null ? "A la medida" : `${formatMxn(item.priceMxn)} MXN`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OFFER_GROUPS.map((group) => (
              <Fragment key={group.title}>
                <tr>
                  <th scope="colgroup" colSpan={5} className="bg-surface py-3 pr-4 pt-8 text-left font-display text-base font-semibold">
                    {group.title}
                  </th>
                </tr>
                {group.items.map((item) =>
                  item.kind === "sub" ? (
                    <tr key={`${group.title}-${item.label}`}>
                      <th scope="colgroup" colSpan={5} className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                        {item.label}
                      </th>
                    </tr>
                  ) : (
                    <tr key={`${group.title}-${item.label}`} className="border-t border-border/70">
                      <th scope="row" className="sticky left-0 bg-background py-2.5 pr-4 text-left font-normal">
                        <FeatureLabel label={item.label} />
                      </th>
                      {item.cells.map((cell, i) => (
                        <td key={LANDING_PLANS[i]!.id} className="px-3 py-2.5 text-center align-middle">
                          <CellValue value={cell} />
                        </td>
                      ))}
                    </tr>
                  )
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Tarjetas de planes. La tabla de comparación solo se pide en /precios. */
export function LandingOffer({ cta, registerHref, compare = false }: { cta: string; registerHref: string; compare?: boolean }) {
  return (
    <div>
      <PlanCarousel cta={cta} registerHref={registerHref} />
      <div className="mt-10 hidden gap-4 sm:mt-12 xl:grid xl:grid-cols-4">
        {LANDING_PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} cta={cta} registerHref={registerHref} />
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-3xl text-pretty text-center text-sm text-muted">
        Precios en MXN, por usuario al mes. {META_FEES_NOTE}{" "}
        {compare ? null : (
          <a href="/precios#comparar" className="font-medium text-accent-ink underline underline-offset-2">
            Compara los planes
          </a>
        )}
      </p>
      {compare ? (
        <div className="mt-16 sm:mt-20">
          <CompareTable />
        </div>
      ) : null}
    </div>
  );
}
