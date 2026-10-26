"use client";

import { useState } from "react";
import { cn } from "@/app/components/ui/cn";
import { BRAND_NAME } from "@/lib/brand";
import { formatMxn, PLAN_LIST, PRICE_UNIT, TRIAL_DAYS } from "@/lib/billing/plans";
import {
  archivo,
  bricolage,
  dmSans,
  figtree,
  fraunces,
  hanken,
  instrument,
  jakarta,
  newsreader,
  outfit,
  sourceSans,
  syne,
} from "./_fonts";

type Pair = {
  id: string;
  name: string;
  display: string;
  body: string;
  displayClass: string;
  bodyClass: string;
  pitch: string;
  current?: boolean;
  reserve?: boolean;
  historic?: boolean;
};

const PAIRS: Pair[] = [
  {
    id: "serifa",
    name: "Serifa + sans",
    display: "Newsreader",
    body: "Figtree",
    displayClass: newsreader.className,
    bodyClass: figtree.className,
    pitch: "Par en producción (2026-10-25). Títulos con autoridad editorial; cuerpo contemporáneo.",
    current: true,
  },
  {
    id: "geometrica",
    name: "Geométrica viva",
    display: "Syne",
    body: "DM Sans",
    displayClass: syne.className,
    bodyClass: dmSans.className,
    pitch: "Reserva documentada en docs/TIPOGRAFIA.md. Display tech; cuerpo limpio para UI densa.",
    reserve: true,
  },
  {
    id: "anterior",
    name: "Anterior",
    display: "Bricolage Grotesque",
    body: "Hanken Grotesk",
    displayClass: bricolage.className,
    bodyClass: hanken.className,
    pitch: "Par histórico (antes de 2026-10-25). Conservado solo para comparar.",
    historic: true,
  },
  {
    id: "editorial",
    name: "Editorial cálida",
    display: "Fraunces",
    body: "Instrument Sans",
    displayClass: fraunces.className,
    bodyClass: instrument.className,
    pitch: "Más personalidad y calor humano. Alternativa no elegida en esta ronda.",
  },
  {
    id: "producto",
    name: "Producto suave",
    display: "Outfit",
    body: "Plus Jakarta Sans",
    displayClass: outfit.className,
    bodyClass: jakarta.className,
    pitch: "Par moderno y amable. Muy legible en móvil; menos “firma” que Newsreader o Syne.",
  },
  {
    id: "estrecha",
    name: "Display estrecha",
    display: "Archivo",
    body: "Source Sans 3",
    displayClass: archivo.className,
    bodyClass: sourceSans.className,
    pitch: "Títulos compactos (más palabras por línea). Cuerpo clásico de producto.",
  },
];

const MIN_PRICE = Math.min(...PLAN_LIST.map((p) => p.pricePerSeatMxn));
const SAMPLE_HEADLINE = "Potencia tus chats. Cierra sin el caos.";
const SAMPLE_BODY =
  "Una bandeja para WhatsApp y tus otros canales, con bots que responden al instante y un pipeline que no deja leads en visto.";

function Specimen({ pair, large }: { pair: Pair; large?: boolean }) {
  return (
    <div className={cn(pair.bodyClass, "min-w-0")}>
      <p
        className={cn(
          pair.displayClass,
          "font-semibold tracking-tight text-accent-ink",
          large ? "text-2xl sm:text-3xl" : "text-xl"
        )}
      >
        {BRAND_NAME}
      </p>
      <h3
        className={cn(
          pair.displayClass,
          "mt-3 font-semibold tracking-tight text-foreground",
          large ? "text-[1.85rem] leading-[1.1] sm:text-4xl sm:leading-[1.05]" : "text-2xl leading-tight"
        )}
      >
        {SAMPLE_HEADLINE}
      </h3>
      <p className={cn("mt-3 text-muted", large ? "text-base leading-relaxed sm:text-lg" : "text-sm leading-relaxed")}>
        {SAMPLE_BODY}
      </p>
      <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border/70 pt-4">
        <p className={cn(pair.displayClass, "text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl")}>
          {formatMxn(MIN_PRICE)}
        </p>
        <p className="text-sm text-muted">{PRICE_UNIT}</p>
      </div>
      <p className="mt-3 text-xs text-muted-strong">
        Prueba {TRIAL_DAYS} días gratis · Sin tarjeta · Pipeline · Automatizaciones
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <span className="inline-flex h-10 items-center rounded-[12px] bg-accent px-4 font-semibold text-on-accent">
          Prueba {TRIAL_DAYS} días gratis
        </span>
        <span className="inline-flex h-10 items-center rounded-[12px] border border-border bg-surface px-4 font-medium">
          Ver precios
        </span>
      </div>
    </div>
  );
}

/** Laboratorio tipográfico interno: mismos textos Colibly en 6 pares. */
export function TypographyPairs() {
  const [selected, setSelected] = useState(PAIRS[0]!.id);
  const active = PAIRS.find((p) => p.id === selected) ?? PAIRS[0]!;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
      <header className="max-w-2xl">
        <p className="text-sm font-medium text-accent-ink">Marca · tipografía</p>
        <h1 className="mt-1 font-display text-page-title font-semibold tracking-tight sm:text-4xl">
          Tipografía · laboratorio
        </h1>
        <p className="mt-3 text-pretty text-muted">
          En producción: Newsreader + Figtree. Reserva: Syne + DM Sans (`docs/TIPOGRAFIA.md`). Página interna — no se
          indexa.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Pares tipográficos">
        {PAIRS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === selected}
            onClick={() => setSelected(p.id)}
            className={cn(
              "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
              p.id === selected
                ? "border-accent-strong bg-accent-subtle text-accent-ink ring-1 ring-accent-strong"
                : "border-border bg-surface text-foreground hover:border-accent-muted"
            )}
          >
            <span className="font-semibold">{p.name}</span>
            {p.current ? <span className="ml-1.5 text-xs text-muted-strong">actual</span> : null}
            {p.reserve ? <span className="ml-1.5 text-xs text-muted-strong">reserva</span> : null}
            {p.historic ? <span className="ml-1.5 text-xs text-muted-strong">histórico</span> : null}
          </button>
        ))}
      </div>

      <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-4 sm:px-8 sm:py-5">
          <h2 className="font-display text-lg font-semibold tracking-tight sm:text-xl">{active.name}</h2>
          <p className="mt-1 text-sm text-muted">
            <span className="font-medium text-foreground">{active.display}</span>
            <span className="text-muted-strong"> + </span>
            <span className="font-medium text-foreground">{active.body}</span>
          </p>
          <p className="mt-2 max-w-2xl text-pretty text-sm text-muted">{active.pitch}</p>
        </div>
        <div className="px-5 py-8 sm:px-8 sm:py-10">
          <Specimen pair={active} large />
        </div>
      </section>

      <h2 className="mt-14 font-display text-xl font-semibold tracking-tight">Comparación rápida</h2>
      <p className="mt-1 text-sm text-muted">Los seis pares en rejilla, mismo bloque de muestra.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PAIRS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className={cn(
              "rounded-2xl border p-5 text-left transition-colors",
              p.id === selected
                ? "border-accent-strong bg-accent-subtle/40 ring-1 ring-accent-strong"
                : "border-border bg-surface hover:border-accent-muted"
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-strong">
              {p.name}
              {p.current ? " · actual" : ""}
              {p.reserve ? " · reserva" : ""}
              {p.historic ? " · histórico" : ""}
            </p>
            <p className="mt-1 text-xs text-muted">
              {p.display} / {p.body}
            </p>
            <div className="mt-4">
              <Specimen pair={p} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
