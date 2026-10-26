"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/app/components/ui/cn";

const WORDS = ["chats", "WhatsApp", "leads", "ventas"] as const;
const INTERVAL_MS = 2800;

/**
 * Titular del hero: una palabra rota (rotator) y "caos" con subrayado animado.
 * Con prefers-reduced-motion: primera palabra fija + subrayado estático.
 */
export function HeroHeadline({ className, style }: { className?: string; style?: CSSProperties }) {
  const [index, setIndex] = useState(0);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % WORDS.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <h1 className={cn(className)} style={style}>
      {/* Frase canónica para AT; el rotator es decorativo. */}
      <span className="sr-only">Potencia tus chats. Cierra sin el caos.</span>
      <span className="block text-balance" aria-hidden>
        Potencia tus{" "}
        <span className="hero-rotate relative inline-grid align-baseline text-left">
          <span className="invisible col-start-1 row-start-1 whitespace-nowrap">WhatsApp</span>
          {reduce ? (
            <span className="col-start-1 row-start-1 whitespace-nowrap text-accent-ink">{WORDS[0]}</span>
          ) : (
            WORDS.map((word, i) => (
              <span
                key={word}
                className={cn(
                  "col-start-1 row-start-1 whitespace-nowrap text-accent-ink transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  i === index
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-2 opacity-0"
                )}
              >
                {word}
              </span>
            ))
          )}
        </span>
        .
      </span>{" "}
      <span className="block text-balance sm:inline" aria-hidden>
        Cierra sin el{" "}
        <span className="hero-highlight relative inline-block text-accent-ink">
          caos
          <span className="hero-highlight-bar" />
        </span>
        .
      </span>
    </h1>
  );
}
