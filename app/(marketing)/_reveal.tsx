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
  const [shown, setShown] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

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
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
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
