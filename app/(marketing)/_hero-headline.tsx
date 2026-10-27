import type { CSSProperties } from "react";
import { cn } from "@/app/components/ui/cn";

/**
 * Titular del hero. Es estático a propósito: la frase completa se entiende
 * sin rotador y el punto queda pegado a cada idea.
 */
export function HeroHeadline({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <h1 className={cn(className)} style={style}>
      <span className="sr-only">Tus chats, en orden. Tus ventas, en movimiento.</span>
      <span className="block text-balance" aria-hidden>
        <span className="block">
          Tus chats, <span className="text-accent-ink">en orden.</span>
        </span>
        <span className="block">
          Tus ventas,{" "}
          <span className="hero-highlight relative inline-block text-accent-ink">
            en movimiento.
            <span className="hero-highlight-bar" />
          </span>
        </span>
      </span>
    </h1>
  );
}
