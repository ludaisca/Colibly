import { cn } from "./cn";

// La palabra "IA" en lugar del ícono de destellos de Lucide, que se retiró
// con la dirección congelada (nov 2026). Misma firma que un ícono de Lucide
// (`size`, `className`) para poder pasarla como `icon` a Button, Dropdown, etc.
export function AiMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center font-semibold leading-none tracking-tight", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.62)) }}
    >
      IA
    </span>
  );
}
