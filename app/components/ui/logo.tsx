import Link from "next/link";
import { cn } from "./cn";
import { BRAND_NAME } from "@/lib/brand";

type LogoSize = "sm" | "md" | "lg";

const SIZE = {
  sm: { box: "h-7 w-7", text: "text-sm"  },
  md: { box: "h-8 w-8", text: "text-base" },
  lg: { box: "h-9 w-9", text: "text-lg"  },
};

const PETALS = Array.from({ length: 12 }, (_, i) => i * 30);

// Girasol: 12 pétalos en --accent alrededor de un centro en --accent-ink.
// Colores por token, así sigue a la paleta sin tocar el SVG.
export function SunflowerMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <g fill="var(--accent)">
        {PETALS.map((deg) => (
          <ellipse key={deg} cx="16" cy="6.2" rx="3.1" ry="5.4" transform={`rotate(${deg} 16 16)`} />
        ))}
      </g>
      <circle cx="16" cy="16" r="6.6" fill="var(--accent-ink)" />
      <circle cx="16" cy="16" r="6.6" fill="none" stroke="var(--accent-hover)" strokeWidth="1" />
    </svg>
  );
}

interface LogoProps {
  brand?: string;
  size?: LogoSize;
  href?: string;
  showWordmark?: boolean;
  className?: string;
}

// El girasol gira al pasar el mouse sobre un logo con enlace (el <Link> lleva `group`).
const MARK_HOVER = "transition-transform duration-700 ease-out motion-safe:group-hover:rotate-[60deg]";

function LogoMark({ size = "md", brand = BRAND_NAME }: { size?: LogoSize; brand?: string }) {
  return (
    <span className={cn("flex items-center gap-2")}>
      <SunflowerMark className={cn(SIZE[size].box, MARK_HOVER)} />
      <span className={cn("font-display font-semibold tracking-tight", SIZE[size].text)}>
        {brand}
      </span>
    </span>
  );
}

export function Logo({ brand = BRAND_NAME, size = "md", href, showWordmark = true, className }: LogoProps) {
  if (!showWordmark) {
    const box = (
      <span className={cn("inline-flex", className)} role="img" aria-label={brand}>
        <SunflowerMark className={cn(SIZE[size].box, MARK_HOVER)} />
      </span>
    );
    return href ? <Link href={href} className="group">{box}</Link> : box;
  }

  const mark = <LogoMark size={size} brand={brand} />;

  if (href) {
    return (
      <Link href={href} className={cn("group inline-flex", className)}>
        {mark}
      </Link>
    );
  }

  return <div className={cn("inline-flex", className)}>{mark}</div>;
}
