import { blobatar } from "blobatar";
import { cn } from "./cn";
import { hueClassFor } from "./hue";

// Figura determinista (blobatar, MIT, versión fija 2.7.0: otra versión podría
// cambiar las caras) para las personas y los bots: contactos, usuarios y
// asistentes. Las cosas (cuentas, plantillas, campañas…) siguen con
// iniciales, que las distinguen mejor por nombre. Sin fondo propio:
// va sobre el recuadro con el hue de la cuenta. El SVG sale solo de un hash
// del texto (no contiene el nombre) y se pinta como <img>, sin insertar markup.
const figureCache = new Map<string, string>();
function figureUri(seed: string): string {
  let uri = figureCache.get(seed);
  if (!uri) {
    uri = `data:image/svg+xml;utf8,${encodeURIComponent(blobatar(seed, { background: false }))}`;
    if (figureCache.size > 500) figureCache.clear();
    figureCache.set(seed, uri);
  }
  return uri;
}

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
  /** Figura (blobatar) en lugar de iniciales. */
  figure?: boolean;
  /** Semilla de la figura (por defecto `name`); un id estable no cambia de cara al renombrar. */
  seed?: string;
}

export function EntityAvatar({ id, name, size = "md", className, figure = false, seed }: EntityAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-lg bg-entity-bg font-semibold text-entity",
        "transition-transform duration-fast ease-brand hover:scale-105",
        SIZE[size],
        hueClassFor(id),
        figure && "overflow-hidden",
        className
      )}
    >
      {figure ? (
        // eslint-disable-next-line @next/next/no-img-element -- SVG generado en memoria (data URI), no un recurso remoto
        <img src={figureUri(seed ?? name)} alt="" className="h-full w-full scale-[1.18]" draggable={false} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
