"use client";

import { useState, type CSSProperties } from "react";
import { Check, CheckCheck, Search, Send } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/app/components/ui/cn";

// Tres direcciones de color para decidir la marca. Cada una redefine solo
// los tokens de acento en un contenedor; el resto de la UI usa el mismo layout.

export type ProposalId = "menta" | "laguna" | "bosque";

interface Proposal {
  id: ProposalId;
  name: string;
  pitch: string;
  when: string;
  accent: string;
  accentHover: string;
  accentInk: string;
  accentSubtle: string;
  accentMuted: string;
  mint: string;
  background: string;
  surfaceLight: string;
  border: string;
  ink: string;
  muted: string;
}

export const PROPOSALS: Proposal[] = [
  {
    id: "menta",
    name: "Menta",
    pitch: "La paleta actual. Tranquila, de producto, ya cableada en la app.",
    when: "Si quieres continuidad y un look serio de CRM sin reinventar.",
    accent: "#0F766E",
    accentHover: "#0B5F58",
    accentInk: "#0B5F58",
    accentSubtle: "#DDF3EE",
    accentMuted: "#A9E3D6",
    mint: "#5EEAD4",
    background: "#F2F9F7",
    surfaceLight: "#E4F1EE",
    border: "#D3E6E2",
    ink: "#0F1A1A",
    muted: "#465757",
  },
  {
    id: "laguna",
    name: "Laguna",
    pitch: "Teal más azul: fresco y contemporáneo, menos “clínica”.",
    when: "Si Menta se siente corporativa y quieres más aire / tech.",
    accent: "#0E7490",
    accentHover: "#0C5F75",
    accentInk: "#0C5F75",
    accentSubtle: "#E0F2FE",
    accentMuted: "#7DD3FC",
    mint: "#67E8F9",
    background: "#F0F9FF",
    surfaceLight: "#E0F2FE",
    border: "#BAE6FD",
    ink: "#0C1A22",
    muted: "#475569",
  },
  {
    id: "bosque",
    name: "Bosque",
    pitch: "Verde más vivo y comercial: energía de venta sin parecer WhatsApp.",
    when: "Si quieres que el color “empuje” más en CTAs y marca.",
    accent: "#047857",
    accentHover: "#065F46",
    accentInk: "#065F46",
    accentSubtle: "#D1FAE5",
    accentMuted: "#6EE7B7",
    mint: "#34D399",
    background: "#F3FAF6",
    surfaceLight: "#ECFDF5",
    border: "#A7F3D0",
    ink: "#0F1A14",
    muted: "#3F5A4C",
  },
];

function scopeVars(p: Proposal): CSSProperties {
  return {
    ["--accent" as string]: p.accent,
    ["--accent-hover" as string]: p.accentHover,
    ["--accent-strong" as string]: p.accent,
    ["--accent-ink" as string]: p.accentInk,
    ["--accent-subtle" as string]: p.accentSubtle,
    ["--accent-muted" as string]: p.accentMuted,
    ["--on-accent" as string]: "#FFFFFF",
    ["--background" as string]: p.background,
    ["--surface" as string]: "#FFFFFF",
    ["--surface-light" as string]: p.surfaceLight,
    ["--border" as string]: p.border,
    ["--foreground" as string]: p.ink,
    ["--muted" as string]: p.muted,
    ["--muted-strong" as string]: p.ink,
    ["--muted-darker" as string]: p.muted,
    background: p.background,
    color: p.ink,
  };
}

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path
        fill="var(--on-accent)"
        fillRule="evenodd"
        d="M21.57 20.68A8.26 8.26 0 1 1 21.57 10.52L18.86 12.63A4.82 4.82 0 1 0 18.86 18.57ZM22.26 13.79L25.18 15.47L22.26 17.16Z"
      />
    </svg>
  );
}

function MiniInbox() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_50px_-28px_rgba(15,26,26,0.45)]">
      <div className="flex items-center gap-2 border-b border-border bg-surface-light/80 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-2 text-[11px] font-medium text-muted-strong">
          {BRAND_NAME} · Chats
        </span>
      </div>
      <div className="grid md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border md:block">
          <div className="space-y-2 border-b border-border p-3">
            <p className="text-sm font-bold">Chats</p>
            <div className="flex h-8 items-center gap-2 rounded-xl border border-border bg-surface-light px-2">
              <Search size={12} className="text-muted-darker" />
              <span className="text-[11px] text-muted-darker">Buscar…</span>
            </div>
          </div>
          {[
            { name: "María R.", preview: "¿Cuánto cuesta…?", active: true, n: 2 },
            { name: "Daniela F.", preview: "¿Tienen talla 25?", active: false, n: 0 },
            { name: "Jorge L.", preview: "Mesa para 4", active: false, n: 1 },
          ].map((c) => (
            <div
              key={c.name}
              className={cn("border-b border-border px-3 py-2.5", c.active && "bg-surface-light")}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-accent-subtle text-[10px] font-semibold text-accent-ink">
                  {c.name.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{c.name}</p>
                  <p className="truncate text-[11px] text-muted-darker">{c.preview}</p>
                </div>
                {c.n > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">
                    {c.n}
                  </span>
                )}
              </div>
            </div>
          ))}
        </aside>
        <div className="flex min-h-[240px] flex-col bg-background">
          <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-subtle text-[10px] font-semibold text-accent-ink">
              MR
            </span>
            <div>
              <p className="text-xs font-semibold">María Rodríguez</p>
              <p className="text-[10px] text-muted-darker">WhatsApp · Bot activo</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 px-3 py-3 text-xs leading-relaxed">
            <p className="max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-surface px-3 py-2 shadow-sm">
              Hola, ¿cuánto cuesta el facial?
            </p>
            <p className="max-w-[88%] self-end rounded-2xl rounded-tr-sm bg-accent-muted px-3 py-2">
              ¡Hola! El facial cuesta $850. ¿Agendamos?
              <span className="mt-1 flex justify-end gap-0.5 text-[9px] text-foreground/65">
                <CheckCheck size={9} />
              </span>
            </p>
          </div>
          <div className="border-t border-border bg-surface px-3 py-2">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-1.5">
              <span className="flex-1 text-[11px] text-muted-darker">Escribe…</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-on-accent">
                <Send size={12} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandProposals() {
  const [active, setActive] = useState<ProposalId>("laguna");
  const proposal = PROPOSALS.find((p) => p.id === active)!;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
      <header className="max-w-2xl">
        <p className="text-sm font-medium text-muted-strong">Borrador interno · no indexar</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Color de marca · 3 propuestas
        </h1>
        <p className="mt-3 text-muted">
          Decisión: <strong className="text-foreground">Laguna</strong> quedó como paleta de marca (tokens, favicon, correos). Esta página queda como referencia de las otras opciones.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Propuestas de color">
        {PROPOSALS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active === p.id}
            onClick={() => setActive(p.id)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors",
              active === p.id
                ? "border-transparent text-white"
                : "border-border bg-surface text-foreground hover:bg-surface-light"
            )}
            style={active === p.id ? { background: p.accent } : undefined}
          >
            <span className="h-3 w-3 rounded-full ring-2 ring-white/40" style={{ background: p.accent }} />
            {p.name}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {PROPOSALS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActive(p.id)}
            className={cn(
              "rounded-2xl border p-4 text-left transition-colors",
              active === p.id ? "border-foreground/25 bg-surface" : "border-border bg-surface/60 hover:bg-surface"
            )}
          >
            <div className="flex gap-1.5">
              {[p.accent, p.accentMuted, p.mint, p.background].map((c) => (
                <span key={c} className="h-8 flex-1 rounded-lg border border-black/5" style={{ background: c }} />
              ))}
            </div>
            <p className="mt-3 font-display text-lg font-semibold">{p.name}</p>
            <p className="mt-1 text-sm text-muted">{p.pitch}</p>
            <p className="mt-2 font-mono text-[11px] text-muted-strong">{p.accent}</p>
          </button>
        ))}
      </div>

      <div
        className="mt-10 overflow-hidden rounded-3xl border border-border"
        style={scopeVars(proposal)}
        role="tabpanel"
      >
        <div className="px-5 pb-2 pt-8 md:px-10 md:pt-10">
          <div className="flex items-center gap-2">
            <Mark />
            <span className="font-display text-xl font-semibold tracking-tight">{BRAND_NAME}</span>
          </div>
          <h2 className="mt-6 max-w-xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Potencia tus chats. Cierra sin el caos.
          </h2>
          <p className="mt-4 max-w-lg text-base text-muted">
            Vista previa con la propuesta <strong className="text-foreground">{proposal.name}</strong>. {proposal.when}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-on-accent">
              Prueba 14 días gratis
            </span>
            <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold">
              Ver precios
            </span>
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {["Sin tarjeta", "API oficial de WhatsApp", "Desde $99 MXN / ejecutivo"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Check size={14} className="text-accent-ink" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="px-4 pb-8 pt-8 md:px-10">
          <MiniInbox />
        </div>
      </div>

      <section className="mt-12 max-w-2xl border-t border-border pt-8">
        <h2 className="font-display text-xl font-semibold">Cómo decidir</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Mira el hero y el botón principal: ¿se siente Colibly o genérico?</li>
          <li>Compara el mock de chats: el acento vive ahí todo el día en el panel.</li>
          <li>Dime el id (<code className="text-foreground">menta</code>, <code className="text-foreground">laguna</code> o <code className="text-foreground">bosque</code>) y lo fijamos en tokens + correos + favicon.</li>
        </ol>
      </section>
    </div>
  );
}
