"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/app/components/theme-toggle";

export interface SiteNavLink {
  href: string;
  label: string;
}

interface SiteMobileNavProps {
  links: SiteNavLink[];
  loginHref: string;
  ctaHref: string;
  ctaLabel: string;
  trackLocation: string;
  /** Texto accesible del <nav>. */
  label?: string;
}

// Menú de hamburguesa del sitio público (debajo de md). Sin dependencias:
// botón con aria-expanded/aria-controls, Escape y clic fuera lo cierran y el
// foco vuelve al botón; al abrir pasa al primer enlace. El panel vive dentro
// del <header> (que es sticky), así el orden de Tab es el visual.
export function SiteMobileNav({ links, loginHref, ctaHref, ctaLabel, trackLocation, label = "Menú principal" }: SiteMobileNavProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    // Si la ventana crece hasta md el panel ya no aplica: no dejar el estado abierto.
    const mq = window.matchMedia("(min-width: 768px)");
    const onMq = () => mq.matches && close(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    mq.addEventListener("change", onMq);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      mq.removeEventListener("change", onMq);
    };
  }, [open, close]);

  const item = "flex min-h-12 items-center text-base font-medium text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-strong";

  return (
    <div ref={rootRef} className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close(false) : setOpen(true))}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-foreground hover:bg-surface-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
      >
        {open ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
      </button>
      {open && (
        <nav
          id={panelId}
          ref={panelRef}
          aria-label={label}
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border bg-background px-4 pb-5 shadow-md"
        >
          <ul className="flex flex-col">
            {links.map(({ href, label: text }) => (
              <li key={href + text} className="border-b border-border/60">
                <a href={href} onClick={() => close(false)} className={item}>{text}</a>
              </li>
            ))}
            <li><a href={loginHref} onClick={() => close(false)} className={item}>Entrar</a></li>
          </ul>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 sm:hidden">
            <span className="text-sm text-muted">Apariencia</span>
            <ThemeToggle />
          </div>
          <a
            href={ctaHref}
            data-track="cta"
            data-track-location={trackLocation}
            onClick={() => close(false)}
            className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-accent px-5 text-base font-semibold text-on-accent shadow-sm hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
          >
            {ctaLabel}
          </a>
        </nav>
      )}
    </div>
  );
}
