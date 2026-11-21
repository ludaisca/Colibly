"use client";

import { blobatar } from "blobatar";
import { Avatar } from "@astryxdesign/core/Avatar";
import { cn } from "./cn";
import { useHueClass } from "./account-hues";

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

const SIZE = { xs: 20, sm: 32, md: 40, lg: 48 } as const;

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

// Adaptador (rediseño con Astryx): Avatar de Astryx con las iniciales (o la
// figura) sobre el tono de la entidad. Decorativo: el nombre ya está al lado.
export function EntityAvatar({ id, name, size = "md", className, figure = false, seed }: EntityAvatarProps) {
  const hueClassFor = useHueClass();
  return (
    <span aria-hidden="true" className="inline-flex shrink-0">
      <Avatar
        name={name}
        src={figure ? figureUri(seed ?? name) : undefined}
        size={SIZE[size]}
        tooltip={false}
        className={cn("bg-entity-bg font-semibold text-entity", hueClassFor(id), className)}
      />
    </span>
  );
}
