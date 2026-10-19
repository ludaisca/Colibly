"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const LINKS = [
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/precios", label: "Precios" },
  { href: "/#preguntas", label: "Preguntas" },
];

// Menú del sitio público debajo de md: sin él, en el celular (de donde llega
// casi todo el tráfico de anuncios) no había forma de saltar a precios.
export function MobileNav({ loginHref }: { loginHref: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-surface-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
      >
        {open ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
      </button>
      {open && (
        <nav
          id={panelId}
          aria-label="Secciones"
          className="absolute inset-x-0 top-full border-b border-border bg-background px-4 pb-4 shadow-md"
        >
          <ul className="flex flex-col">
            {LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center border-b border-border/60 text-base font-medium text-foreground last:border-b-0"
                >
                  {label}
                </Link>
              </li>
            ))}
            <li><a href={loginHref} onClick={() => setOpen(false)} className="flex min-h-12 items-center text-base font-medium text-foreground">Entrar</a></li>
          </ul>
        </nav>
      )}
    </div>
  );
}
