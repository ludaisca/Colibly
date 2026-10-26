"use client";

import { useState, type CSSProperties } from "react";
import { Check, CheckCheck, Search, Send } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/app/components/ui/cn";

/** Dirección de paleta: redefine tokens semánticos en un contenedor. */
export type PaletteId = "actual" | "neutros" | "arena" | "coral";

export interface Palette {
  id: PaletteId;
  name: string;
  pitch: string;
  when: string;
  /** Tokens semánticos (tema claro). */
  tokens: {
    background: string;
    foreground: string;
    surface: string;
    surfaceLight: string;
    border: string;
    muted: string;
    mutedStrong: string;
    accent: string;
    accentHover: string;
    accentInk: string;
    accentSubtle: string;
    accentMuted: string;
    onAccent: string;
    accent2: string;
    accent2Bg: string;
    success: string;
    successBg: string;
    warning: string;
    warningBg: string;
    danger: string;
    dangerBg: string;
    info: string;
    infoBg: string;
  };
  swatches: Array<{ label: string; hex: string; note?: string }>;
}

export const PALETTES: Palette[] = [
  {
    id: "actual",
    name: "Laguna actual",
    pitch: "Todo tinte cielo: fondo, borde y acento de la misma familia. Por eso se ve plano.",
    when: "Referencia de lo que corre hoy.",
    tokens: {
      background: "#F0F9FF",
      foreground: "#0C1A22",
      surface: "#FFFFFF",
      surfaceLight: "#E0F2FE",
      border: "#BAE6FD",
      muted: "#475569",
      mutedStrong: "#334155",
      accent: "#0E7490",
      accentHover: "#0C5F75",
      accentInk: "#0C5F75",
      accentSubtle: "#E0F2FE",
      accentMuted: "#7DD3FC",
      onAccent: "#FFFFFF",
      accent2: "#334155",
      accent2Bg: "#E2E8F0",
      success: "#17663F",
      successBg: "#E3F4EA",
      warning: "#9A4307",
      warningBg: "#FDEFE3",
      danger: "#B42318",
      dangerBg: "#FBE6E3",
      info: "#1D5FBF",
      infoBg: "#E6EEFA",
    },
    swatches: [
      { label: "Accent", hex: "#0E7490" },
      { label: "Fondo", hex: "#F0F9FF" },
      { label: "Borde", hex: "#BAE6FD" },
      { label: "Subtle", hex: "#E0F2FE" },
      { label: "Muted sky", hex: "#7DD3FC" },
      { label: "Ink", hex: "#0C1A22" },
    ],
  },
  {
    id: "neutros",
    name: "Laguna + neutros",
    pitch: "Mismo teal de marca; fondos y bordes en gris frío sin cian. El acento vuelve a destacarse.",
    when: "Si solo quieres arreglar “todo se ve igual” sin cambiar la identidad.",
    tokens: {
      background: "#F4F6F8",
      foreground: "#0C1A22",
      surface: "#FFFFFF",
      surfaceLight: "#EEF1F4",
      border: "#D8DEE6",
      muted: "#5B6B7A",
      mutedStrong: "#3D4B58",
      accent: "#0E7490",
      accentHover: "#0C5F75",
      accentInk: "#0A5A6E",
      accentSubtle: "#DDF0F5",
      accentMuted: "#9BD0DE",
      onAccent: "#FFFFFF",
      accent2: "#3D4B58",
      accent2Bg: "#E8ECF0",
      success: "#17663F",
      successBg: "#E3F4EA",
      warning: "#9A4307",
      warningBg: "#FDEFE3",
      danger: "#B42318",
      dangerBg: "#FBE6E3",
      info: "#1D5FBF",
      infoBg: "#E6EEFA",
    },
    swatches: [
      { label: "Accent", hex: "#0E7490" },
      { label: "Fondo", hex: "#F4F6F8", note: "neutro" },
      { label: "Borde", hex: "#D8DEE6", note: "neutro" },
      { label: "Subtle", hex: "#DDF0F5" },
      { label: "Muted", hex: "#9BD0DE" },
      { label: "Ink", hex: "#0C1A22" },
    ],
  },
  {
    id: "arena",
    name: "Laguna + arena",
    pitch: "Teal + papel cálido. Contraste de temperatura: el producto se siente menos “hospital / SaaS frío”.",
    when: "Si quieres calidez mexicana sin caer en crema+terracota genérico.",
    tokens: {
      background: "#F6F3EE",
      foreground: "#1A1814",
      surface: "#FFFCF8",
      surfaceLight: "#EFEBE4",
      border: "#DDD5C8",
      muted: "#6B6358",
      mutedStrong: "#4A443C",
      accent: "#0E7490",
      accentHover: "#0C5F75",
      accentInk: "#0A5A6E",
      accentSubtle: "#D9EEF3",
      accentMuted: "#8EC9D8",
      onAccent: "#FFFFFF",
      accent2: "#B45309",
      accent2Bg: "#F5E6D3",
      success: "#17663F",
      successBg: "#E3F4EA",
      warning: "#9A4307",
      warningBg: "#FDEFE3",
      danger: "#B42318",
      dangerBg: "#FBE6E3",
      info: "#1D5FBF",
      infoBg: "#E6EEFA",
    },
    swatches: [
      { label: "Accent", hex: "#0E7490" },
      { label: "Fondo", hex: "#F6F3EE", note: "arena" },
      { label: "Borde", hex: "#DDD5C8" },
      { label: "Apoyo", hex: "#B45309", note: "ámbar" },
      { label: "Subtle", hex: "#D9EEF3" },
      { label: "Ink", hex: "#1A1814" },
    ],
  },
  {
    id: "coral",
    name: "Laguna + coral",
    pitch: "Teal de marca + coral como acento de apoyo (badges, highlights). Más ritmo visual en CTAs secundarios.",
    when: "Si el panel y la landing se sienten monocromos y quieres un segundo color vivo.",
    tokens: {
      background: "#F3F6F8",
      foreground: "#0C1A22",
      surface: "#FFFFFF",
      surfaceLight: "#ECF0F3",
      border: "#D5DCE3",
      muted: "#5B6B7A",
      mutedStrong: "#3D4B58",
      accent: "#0E7490",
      accentHover: "#0C5F75",
      accentInk: "#0A5A6E",
      accentSubtle: "#DDF0F5",
      accentMuted: "#9BD0DE",
      onAccent: "#FFFFFF",
      // #E11D48 (lab) → #C21E4C para AA sobre el tinte.
      accent2: "#C21E4C",
      accent2Bg: "#FFE4EA",
      success: "#17663F",
      successBg: "#E3F4EA",
      warning: "#9A4307",
      warningBg: "#FDEFE3",
      danger: "#B42318",
      dangerBg: "#FBE6E3",
      info: "#1D5FBF",
      infoBg: "#E6EEFA",
    },
    swatches: [
      { label: "Accent", hex: "#0E7490" },
      { label: "Coral", hex: "#C21E4C", note: "apoyo AA" },
      { label: "Fondo", hex: "#F3F6F8" },
      { label: "Borde", hex: "#D5DCE3" },
      { label: "Coral bg", hex: "#FFE4EA" },
      { label: "Ink", hex: "#0C1A22" },
    ],
  },
];

function scopeVars(p: Palette): CSSProperties {
  const t = p.tokens;
  return {
    ["--background" as string]: t.background,
    ["--foreground" as string]: t.foreground,
    ["--surface" as string]: t.surface,
    ["--surface-light" as string]: t.surfaceLight,
    ["--border" as string]: t.border,
    ["--muted" as string]: t.muted,
    ["--muted-darker" as string]: t.muted,
    ["--muted-strong" as string]: t.mutedStrong,
    ["--accent" as string]: t.accent,
    ["--accent-hover" as string]: t.accentHover,
    ["--accent-strong" as string]: t.accent,
    ["--accent-ink" as string]: t.accentInk,
    ["--accent-subtle" as string]: t.accentSubtle,
    ["--accent-muted" as string]: t.accentMuted,
    ["--on-accent" as string]: t.onAccent,
    ["--accent-2" as string]: t.accent2,
    ["--accent-2-bg" as string]: t.accent2Bg,
    ["--success" as string]: t.success,
    ["--success-bg" as string]: t.successBg,
    ["--warning" as string]: t.warning,
    ["--warning-bg" as string]: t.warningBg,
    ["--danger" as string]: t.danger,
    ["--danger-bg" as string]: t.dangerBg,
    ["--info" as string]: t.info,
    ["--info-bg" as string]: t.infoBg,
    background: t.background,
    color: t.foreground,
  };
}

function MiniUi() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-surface-light px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="truncate text-[11px] font-medium text-muted-strong">
          {BRAND_NAME} · Chats
        </span>
        <span className="ml-auto rounded-md bg-accent-subtle px-2 py-0.5 text-[10px] font-semibold text-accent-ink">
          En vivo
        </span>
      </div>
      <div className="grid sm:grid-cols-[9.5rem_1fr]">
        <aside className="border-b border-border p-2 sm:border-b-0 sm:border-r">
          <div className="mb-2 flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-[10px] text-muted">
            <Search size={12} /> Buscar…
          </div>
          {["María R.", "Daniela F.", "Jorge L."].map((n, i) => (
            <div
              key={n}
              className={cn(
                "rounded-lg px-2 py-1.5 text-xs",
                i === 0 ? "bg-accent-subtle font-semibold text-accent-ink" : "text-foreground"
              )}
            >
              {n}
            </div>
          ))}
        </aside>
        <div className="flex flex-col gap-2 bg-background p-3 text-sm">
          <p className="max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-surface px-3 py-2 shadow-sm">
            ¿Cuánto cuesta el facial?
          </p>
          <p className="max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-accent-muted px-3 py-2 text-foreground">
            $850 · 60 min. ¿Agendamos?
            <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-foreground/65">
              10:42 <CheckCheck size={10} />
            </span>
          </p>
          <div className="mt-auto flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-1.5">
            <span className="flex-1 text-xs text-muted">Escribe…</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-on-accent">
              <Send size={12} />
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border bg-surface px-3 py-2.5">
        <span className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent">
          Primario
        </span>
        <span className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium">
          Secundario
        </span>
        <span className="inline-flex h-8 items-center rounded-lg bg-accent-2-bg px-3 text-xs font-semibold text-accent-2">
          Apoyo
        </span>
        <span className="inline-flex h-8 items-center gap-1 rounded-lg bg-success-bg px-2 text-[10px] font-semibold text-success">
          <Check size={12} /> ok
        </span>
        <span className="inline-flex h-8 items-center rounded-lg bg-warning-bg px-2 text-[10px] font-semibold text-warning">
          aviso
        </span>
        <span className="inline-flex h-8 items-center rounded-lg bg-danger-bg px-2 text-[10px] font-semibold text-danger">
          error
        </span>
      </div>
    </div>
  );
}

/** Laboratorio de paletas — no aplica cambios globales hasta que se elija una. */
export function ColorPalettes() {
  const [selected, setSelected] = useState<PaletteId>("coral");
  const active = PALETTES.find((p) => p.id === selected) ?? PALETTES[3]!;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
      <header className="max-w-2xl">
        <p className="text-sm font-medium text-accent-ink">Marca · color</p>
        <h1 className="mt-1 font-display text-page-title font-semibold tracking-tight sm:text-4xl">
          Paleta: más jerarquía, mismo Laguna
        </h1>
        <p className="mt-3 text-pretty text-muted">
          En producción corre <strong className="font-semibold text-foreground">Laguna + coral</strong>.
          Aquí quedan las cuatro direcciones del lab (referencia). Página interna — no se indexa.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Paletas">
        {PALETTES.map((p) => (
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
            {p.id === "coral" ? <span className="ml-1.5 text-xs text-muted-strong">hoy</span> : null}
          </button>
        ))}
      </div>

      <section
        className="mt-8 overflow-hidden rounded-2xl border border-border"
        style={scopeVars(active)}
      >
        <div className="border-b border-border px-5 py-4 sm:px-8 sm:py-5" style={{ background: active.tokens.surface }}>
          <h2 className="font-display text-lg font-semibold tracking-tight sm:text-xl">{active.name}</h2>
          <p className="mt-1 max-w-2xl text-pretty text-sm text-muted">{active.pitch}</p>
          <p className="mt-2 text-sm text-muted-strong">{active.when}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {active.swatches.map((s) => (
              <div key={s.label} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5">
                <span className="h-7 w-7 rounded-md border border-border/80" style={{ background: s.hex }} />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold leading-tight">{s.label}</p>
                  <p className="font-mono text-[10px] text-muted-strong">
                    {s.hex}
                    {s.note ? ` · ${s.note}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-8 sm:px-8 sm:py-10">
          <MiniUi />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="font-display text-2xl font-semibold tracking-tight">Potencia tus chats</p>
              <p className="mt-2 text-sm text-muted">Texto de apoyo sobre el fondo de esta paleta.</p>
              <button
                type="button"
                className="mt-4 inline-flex h-10 items-center rounded-[12px] bg-accent px-4 text-sm font-semibold text-on-accent"
              >
                Prueba gratis
              </button>
            </div>
            <div className="rounded-xl border border-border bg-surface-light p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">Surface light</p>
              <p className="mt-2 text-sm text-muted-strong">Zonas secundarias, listas, sidebars.</p>
            </div>
            <div className="rounded-xl border border-accent-muted bg-accent-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">Accent subtle</p>
              <p className="mt-2 text-sm text-accent-ink">Selección, chips, resaltes de marca.</p>
            </div>
          </div>
        </div>
      </section>

      <h2 className="mt-14 font-display text-xl font-semibold tracking-tight">Las cuatro juntas</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className={cn(
              "overflow-hidden rounded-2xl border text-left transition-shadow",
              p.id === selected ? "ring-2 ring-accent-strong" : "hover:shadow-md"
            )}
            style={scopeVars(p)}
          >
            <div className="flex h-10">
              {p.swatches.slice(0, 5).map((s) => (
                <span key={s.label} className="flex-1" style={{ background: s.hex }} title={s.label} />
              ))}
            </div>
            <div className="border-t border-border bg-surface px-4 py-3">
              <p className="font-semibold">{p.name}</p>
              <p className="mt-0.5 text-xs text-muted">{p.pitch}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
