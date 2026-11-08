import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "./cn";

// "← Volver a…" (2026-11-07, auditoría): el texto mide 20 px de alto, poco
// para el dedo en un panel que se usa sobre todo en el teléfono. El área
// táctil crece con un pseudo-elemento (≈ 40 px) sin mover nada del diseño.
export function BackLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground",
        "after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-['']",
        className
      )}
    >
      <ArrowLeft size={14} aria-hidden />
      {children}
    </Link>
  );
}
