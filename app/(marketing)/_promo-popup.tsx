"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { BRAND_NAME } from "@/lib/brand";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { cn } from "@/app/components/ui/cn";

const STORAGE_KEY = "colibly_promo_dismissed";
/** No volver a mostrar hasta pasados estos días. */
const DISMISS_DAYS = 7;
/** Espera tras cargar la página antes de abrir (ms). */
const SHOW_DELAY_MS = 12_000;
/** Solo en las páginas donde el popup tiene sentido comercial. */
const SHOW_ON_PATHS = new Set(["/", "/precios"]);

const LEADS = [
  { name: "María Rodríguez", meta: "Facial hidratante", tag: "oportunidad", score: 72 },
  { name: "Daniela Flores", meta: "Instagram · Tenis 25", tag: "interesado", score: 61 },
  { name: "Jorge López", meta: "Reserva mesa · 4", tag: "cita", score: 91 },
] as const;

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* private mode / blocked storage */
  }
}

function PromoVisual({ className }: { className?: string }) {
  const featured = LEADS[0];
  return (
    <div className={cn("relative select-none", className)} aria-hidden>
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-[0_24px_60px_-28px_rgba(15,26,26,0.45)]">
        <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="ml-1 truncate text-[10px] font-medium text-muted-strong">
            {BRAND_NAME} · Ventas
          </span>
        </div>
        <div className="bg-surface-light/60 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-strong">Nuevos</p>
          <ul className="mt-2 space-y-2">
            {LEADS.slice(1).map((lead) => (
              <li
                key={lead.name}
                className="rounded-xl border border-border/70 bg-surface px-2.5 py-2 opacity-70"
              >
                <p className="truncate text-xs font-semibold text-foreground">{lead.name}</p>
                <p className="truncate text-[10px] text-muted-darker">{lead.meta}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Tarjeta protagonista + acento “IA” */}
      <div className="absolute -bottom-2 left-3 right-2 sm:-bottom-3 sm:left-6 sm:right-4">
        <div className="relative rounded-2xl border border-accent-muted bg-surface p-3 shadow-[0_18px_40px_-18px_rgba(14,116,144,0.55)] ring-1 ring-accent-strong/20">
          <div className="flex items-start gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-xs font-bold text-accent-ink">
              MR
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{featured.name}</p>
              <p className="truncate text-[11px] text-muted-darker">{featured.meta}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-success-bg px-1.5 py-0.5 text-[10px] font-semibold text-success">
                  {featured.tag}
                </span>
                <span className="text-[10px] tabular-nums text-muted-strong">score {featured.score}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-light">
                <div className="h-full rounded-full bg-success" style={{ width: `${featured.score}%` }} />
              </div>
            </div>
          </div>
          <span className="landing-spark absolute -right-2 -top-2 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent shadow-md ring-4 ring-surface">
            <Sparkles size={18} aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Popup promocional estilo “listo para probar” (landing). Una vez cada DISMISS_DAYS. */
export function PromoPopup() {
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  const close = useCallback(() => {
    setVisible(false);
    markDismissed();
    window.setTimeout(() => setOpen(false), 200);
  }, []);

  useEffect(() => {
    if (wasDismissedRecently()) return;
    // Solo landing y precios: en legales/contacto/docs no interrumpe.
    if (!SHOW_ON_PATHS.has(window.location.pathname)) return;
    const t = window.setTimeout(() => {
      // La ruta pudo cambiar durante la espera (el layout no se remonta).
      if (!SHOW_ON_PATHS.has(window.location.pathname)) return;
      setOpen(true);
      requestAnimationFrame(() => setVisible(true));
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    // El resto de la página queda inerte mientras el diálogo está abierto.
    const roots = Array.from(document.querySelectorAll<HTMLElement>("header, main, footer"));
    roots.forEach((el) => el.setAttribute("inert", ""));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.offsetParent !== null && !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      roots.forEach((el) => el.removeAttribute("inert"));
      const previous = previousFocusRef.current;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar promoción"
        className={cn(
          "absolute inset-0 bg-foreground/45 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={close}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={cn(
          "relative z-10 grid w-full max-w-3xl overflow-hidden rounded-[1.35rem] border border-border/70 bg-surface shadow-[0_32px_80px_-24px_rgba(15,26,26,0.55)] transition-[opacity,transform] duration-300 ease-out sm:rounded-[1.5rem] md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]",
          visible ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-4 opacity-0 sm:translate-y-0 sm:scale-95"
        )}
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 80% at 100% 0%, color-mix(in oklab, var(--accent-subtle) 85%, transparent), transparent 55%),
            radial-gradient(ellipse 50% 60% at 0% 100%, color-mix(in oklab, var(--accent-2-bg) 70%, transparent), transparent 50%),
            linear-gradient(165deg, var(--surface), var(--background))
          `,
        }}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-light hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col justify-center px-5 pb-2 pt-12 sm:px-8 sm:pb-8 sm:pt-10 md:py-12 md:pl-10 md:pr-6">
          <h2 id={titleId} className="text-balance font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl md:text-[1.85rem] md:leading-tight">
            ¿Listo para un CRM con IA que sí responde?
          </h2>
          <p id={descId} className="mt-3 text-pretty text-sm leading-relaxed text-muted sm:text-[15px]">
            {BRAND_NAME} junta WhatsApp, Instagram, Messenger y más en una bandeja. Bots que atienden al instante
            y un pipeline que no deja leads en visto.
          </p>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <Button
              href="/register"
              size="lg"
              iconRight={Sparkles}
              className="w-full sm:w-auto"
              data-track="cta"
              data-track-location="promo_popup"
              onClick={close}
            >
              Prueba {TRIAL_DAYS} días de Pro
            </Button>
            <Link
              href="/precios"
              onClick={close}
              className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-medium text-accent-ink underline-offset-2 hover:underline"
            >
              Ver precios
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-strong">Sin tarjeta · Cancela cuando quieras</p>
        </div>

        <div className="relative px-5 pb-8 pt-2 sm:px-8 sm:pb-10 md:flex md:items-end md:px-6 md:pb-10 md:pt-10">
          <PromoVisual className="mx-auto w-full max-w-[17.5rem] pb-6 sm:max-w-[19rem] md:mx-0 md:max-w-none md:pb-4" />
        </div>
      </div>
    </div>
  );
}
