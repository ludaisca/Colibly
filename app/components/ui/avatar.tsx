import { cn } from "./cn";
import { hueClassFor } from "./hue";

// Avatar de iniciales con hue determinista por entidad — server-safe (sin
// "use client", sin iconos como props), usable directo desde los RSC de
// overview y desde componentes client.

const SIZE: Record<"xs" | "sm" | "md" | "lg", string> = {
  xs: "h-5 w-5 rounded-md text-[9px]",
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface EntityAvatarProps {
  /** Id estable de la entidad (normalmente accountId) — decide el hue. */
  id: string;
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

export function EntityAvatar({ id, name, size = "md", className }: EntityAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-lg bg-entity-bg font-semibold text-entity",
        "transition-transform duration-fast ease-brand hover:scale-105",
        SIZE[size],
        hueClassFor(id),
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
