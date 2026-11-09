"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Arma la secuencia de un tramo del hilo y la reproduce al entrar en vista.
// Estado inicial "sin armar": el servidor y quien no tiene JavaScript ven
// todo escrito; solo se oculta (data-seq="armed") lo que aún está fuera de la
// vista, así nunca desaparece algo que ya se estaba leyendo.
export function SeqPlay({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "armed" | "play">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return; // ya visible: se queda escrito
    setState("armed");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("play");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -20% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-seq={state === "idle" ? undefined : state}>
      {children}
    </div>
  );
}
