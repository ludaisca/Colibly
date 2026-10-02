import Link from "next/link";
import { cn } from "./cn";
import { BRAND_NAME } from "@/lib/brand";

type LogoSize = "sm" | "md" | "lg";

const SIZE = {
  sm: { box: "h-7 w-7", text: "text-sm"  },
  md: { box: "h-8 w-8", text: "text-base" },
  lg: { box: "h-9 w-9", text: "text-lg"  },
};

// Marca provisional de Colibly: una "C" sobre el acento, mientras se define el
// logo final (concepto "Impulso", ver docs/PLAN_LANZAMIENTO.md). Colores por
// token, así sigue a la paleta y al tema sin tocar el SVG. La misma figura en
// colores fijos vive en lib/brand-mark.ts (favicon, ícono de iOS, imágenes).
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M21.1 11.2 A7 7 0 1 0 21.1 20.8" fill="none" stroke="var(--on-accent)" strokeWidth="3.6" strokeLinecap="round" />
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

// La marca se inclina un poco al pasar el mouse sobre un logo con enlace (el <Link> lleva `group`).
const MARK_HOVER = "transition-transform duration-300 ease-out motion-safe:group-hover:-rotate-6";

function LogoMark({ size = "md", brand = BRAND_NAME }: { size?: LogoSize; brand?: string }) {
  return (
    <span className={cn("flex items-center gap-2")}>
      <BrandMark className={cn(SIZE[size].box, MARK_HOVER)} />
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
        <BrandMark className={cn(SIZE[size].box, MARK_HOVER)} />
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
