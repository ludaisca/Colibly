import { ArrowLeft } from "lucide-react";
import { Link as AxLink } from "@astryxdesign/core/Link";
import { cn } from "./cn";

// "← Volver a…": Link de Astryx (navega con el Link de Next por LinkProvider).
// El área táctil crece con un pseudo-elemento (≈ 40 px) sin mover el diseño.
export function BackLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <AxLink
      href={href}
      color="secondary"
      className={cn("relative inline-flex items-center gap-1.5 text-sm after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-['']", className)}
    >
      <ArrowLeft size={14} aria-hidden />
      {children}
    </AxLink>
  );
}
