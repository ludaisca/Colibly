import Link from "next/link";
import { cn } from "./cn";
import { BRAND_NAME } from "@/lib/brand";

type LogoSize = "sm" | "md" | "lg";

const SIZE = {
  sm: { box: "h-7 w-7", text: "text-sm"  },
  md: { box: "h-8 w-8", text: "text-base" },
  lg: { box: "h-9 w-9", text: "text-lg"  },
};

// Marca Nexo (C anular + triángulo al este) sobre el acento Laguna. Colores por
// token; la misma geometría en hex vive en lib/brand-mark.ts (favicon, iOS, OG).
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path
        fill="var(--on-accent)"
        fillRule="evenodd"
        d="M21.57 20.68A8.26 8.26 0 1 1 21.57 10.52L18.86 12.63A4.82 4.82 0 1 0 18.86 18.57ZM22.26 13.79L25.18 15.47L22.26 17.16Z"
      />
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
