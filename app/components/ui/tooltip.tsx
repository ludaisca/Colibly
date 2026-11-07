"use client";

import type { ReactElement } from "react";
import { Tooltip as Base } from "@base-ui/react/tooltip";

// Tooltip real (Base UI) en lugar del atributo `title` (2026-11-07): aparece
// también con el teclado (al enfocar), se posiciona sin salirse de la
// pantalla y respeta el tema. `title` no se ve con teclado ni en táctil.
//
// Reglas:
// - Es una ayuda visual: el botón de solo icono lleva su `aria-label` igual.
// - El hijo debe ser un elemento que acepte ref y props (un <button>, un <a>,
//   `Button`, `Link`). No envolver el disparador de un `Dropdown`: ahí basta el
//   `aria-label`.
// - En táctil no se muestra (no hay hover): nada importante vive solo aquí.

interface TooltipProps {
  label: string;
  children: ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({ label, children, side = "top" }: TooltipProps) {
  return (
    <Base.Root>
      <Base.Trigger delay={350} closeDelay={0} render={children} />
      <Base.Portal>
        <Base.Positioner side={side} sideOffset={6} collisionPadding={8} className="z-[90] outline-none">
          <Base.Popup className="max-w-64 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md origin-[var(--transform-origin)] transition-[opacity,scale] duration-fast ease-brand data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none">
            {label}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
