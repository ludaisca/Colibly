"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/app/components/ui/cn";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Retraso en ms al entrar (stagger). */
  delay?: number;
  /** Desde qué lado entra. */
  from?: "up" | "left" | "right" | "none";
  /** Una sola vez (default) o cada vez que entra en vista. */
  once?: boolean;
  as?: "div" | "section" | "li" | "span";
};

/**
 * Revelado al scroll con IntersectionObserver (todos los navegadores).
 * Respeta prefers-reduced-motion: muestra el contenido sin animar.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  from = "up",
  once = true,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Arranca en false en servidor y cliente para no romper la hidratación.
  // El CSS de prefers-reduced-motion ya muestra el contenido sin animación;
  // no hace falta cambiar el estado en ese caso.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          if (once) io.disconnect();
        } else if (!once) {
          setShown(false);
        }
      },
      // Umbral 0: un bloque más alto que la pantalla (la comparación de planes)
      // nunca llega a ocupar el 12 % del viewport, y se quedaba invisible.
      { rootMargin: "0px 0px -8% 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={cn(
        "landing-reveal",
        from !== "none" && `landing-reveal--${from}`,
        shown && "is-in",
        className
      )}
      style={delay ? ({ "--landing-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
