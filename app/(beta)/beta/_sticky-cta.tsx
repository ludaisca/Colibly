"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/app/components/ui/cn";

// Barra inferior solo para móvil: el CTA del header queda arriba, fuera del alcance del pulgar.
// Aparece cuando el botón del hero ya salió por arriba y se esconde sobre el formulario y el pie,
// donde el CTA sobra o taparía el contenido.
export function StickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.querySelector('[data-track-location="beta_hero"]');
    if (!hero || !("IntersectionObserver" in window)) return;

    let heroScrolledPast = false;
    const covering = new Set<Element>();
    const update = () => setVisible(heroScrolledPast && covering.size === 0);

    const heroObserver = new IntersectionObserver(([entry]) => {
      heroScrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      update();
    });
    const coverObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) covering.add(entry.target);
        else covering.delete(entry.target);
      }
      update();
    });

    heroObserver.observe(hero);
    document.querySelectorAll("#solicitar, footer").forEach((el) => coverObserver.observe(el));
    return () => {
      heroObserver.disconnect();
      coverObserver.disconnect();
    };
  }, []);

  return (
    <div
      inert={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden",
        "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out",
        visible ? "translate-y-0" : "translate-y-full",
      )}
    >
      <a
        href="#solicitar"
        data-track="cta"
        data-track-location="beta_sticky"
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
      >
        Solicitar acceso a la beta <ArrowRight size={17} aria-hidden />
      </a>
    </div>
  );
}
