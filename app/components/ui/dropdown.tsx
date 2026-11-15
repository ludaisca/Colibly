"use client";

import React, { createContext, useContext } from "react";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

// Menús y paneles flotantes sobre Base UI (2026-11-07). Antes era un
// componente hecho a mano (portal + getBoundingClientRect, sin roles ni
// flechas). Ahora:
// - `Dropdown` (por defecto) es un **menú de acciones**: Base UI `Menu`, con
//   roles menu/menuitem, flechas, Inicio/Fin, búsqueda por letra, Escape,
//   foco que vuelve al disparador y posición que evita los bordes.
// - `Dropdown panel` es un **panel con contenido propio** (búsqueda, campos,
//   textos, varias acciones por fila): Base UI `Popover`. Dentro de un panel,
//   `DropdownItem` es un botón normal.
// La API pública se conserva (`trigger`, `align`, `open`, `onOpenChange`,
// `closeOnSelect`, `className`); `portal` se acepta por compatibilidad pero ya
// no hace falta: el menú siempre se dibuja en el body.

type Mode = "menu" | "panel";

const DropdownContext = createContext<{ mode: Mode; closeOnSelect: boolean; close: () => void } | null>(null);

const POPUP =
  "z-[70] min-w-[180px] max-w-[calc(100vw-16px)] max-h-[var(--available-height)] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg outline-none origin-[var(--transform-origin)] transition-[scale,opacity] duration-fast ease-brand data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 motion-reduce:transition-none";

const ITEM =
  "w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left outline-none transition-colors select-none cursor-default disabled:opacity-40 disabled:cursor-not-allowed data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed";

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Sin efecto: se dibuja siempre en el body. Se acepta por compatibilidad. */
  portal?: boolean;
  /** Menú: cerrar al elegir una opción. Panel: cerrar con cualquier clic dentro. */
  closeOnSelect?: boolean;
  /** Panel con contenido propio (Popover) en lugar de menú de acciones. */
  panel?: boolean;
  /** Nombre accesible del panel (por defecto, ninguno). */
  panelLabel?: string;
}

/** Disparador: un elemento que ya es botón (o un componente con ref) se usa tal
 * cual; cualquier otro contenido se envuelve en un botón sin estilo. */
function triggerProps(trigger: React.ReactNode, className?: string) {
  if (React.isValidElement(trigger) && (trigger.type === "button" || trigger.type === DropdownButton)) {
    return { render: trigger as React.ReactElement<Record<string, unknown>>, className };
  }
  return { className: cn("inline-flex max-w-full cursor-pointer rounded-lg text-left", className), children: trigger };
}

export function Dropdown({
  trigger,
  children,
  align = "left",
  className,
  open,
  onOpenChange,
  closeOnSelect = true,
  panel = false,
  panelLabel,
}: DropdownProps) {
  const [innerOpen, setInnerOpen] = React.useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setInnerOpen(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange]
  );
  const close = React.useCallback(() => setOpen(false), [setOpen]);
  const ctx = React.useMemo(() => ({ mode: (panel ? "panel" : "menu") as Mode, closeOnSelect, close }), [panel, closeOnSelect, close]);
  const positioner = { side: "bottom" as const, align: align === "right" ? ("end" as const) : ("start" as const), sideOffset: 6, collisionPadding: 8 };
  const wrapperClass = cn("relative inline-flex max-w-full", className);

  if (panel) {
    return (
      <DropdownContext.Provider value={ctx}>
        <Popover.Root open={isOpen} onOpenChange={(next) => setOpen(next)}>
          <span className={wrapperClass}>
            <Popover.Trigger {...triggerProps(trigger)} />
          </span>
          <Popover.Portal>
            <Popover.Positioner {...positioner} className="z-[70] outline-none">
              <Popover.Popup
                aria-label={panelLabel}
                className={POPUP}
                onClick={closeOnSelect ? close : undefined}
              >
                {children}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </DropdownContext.Provider>
    );
  }

  return (
    <DropdownContext.Provider value={ctx}>
      <Menu.Root open={isOpen} onOpenChange={(next) => setOpen(next)} modal={false}>
        <span className={wrapperClass}>
          <Menu.Trigger {...triggerProps(trigger)} />
        </span>
        <Menu.Portal>
          <Menu.Positioner {...positioner} className="z-[70] outline-none">
            <Menu.Popup className={POPUP}>{children}</Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </DropdownContext.Provider>
  );
}

interface DropdownItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ElementType;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  /** Solo en menú: no cerrar al elegir (p. ej. alternar "Detalles"). */
  keepOpen?: boolean;
}

export function DropdownItem({ children, onClick, icon: Icon, danger, disabled, className, keepOpen }: DropdownItemProps) {
  const ctx = useContext(DropdownContext);
  const tone = danger
    ? "text-danger hover:bg-danger-bg data-[highlighted]:bg-danger-bg"
    : "text-foreground hover:bg-surface-light data-[highlighted]:bg-surface-light focus-visible:bg-surface-light";
  const content = (
    <>
      {Icon && <Icon size={15} aria-hidden className={cn("shrink-0", danger ? "text-danger" : "text-muted-darker")} />}
      {children}
    </>
  );

  if (ctx?.mode === "menu") {
    return (
      <Menu.Item
        onClick={onClick}
        disabled={disabled}
        closeOnClick={keepOpen ? false : ctx.closeOnSelect}
        className={cn(ITEM, tone, className)}
      >
        {content}
      </Menu.Item>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(ITEM, tone, className)}>
      {content}
    </button>
  );
}

export function DropdownDivider() {
  const ctx = useContext(DropdownContext);
  if (ctx?.mode === "menu") return <Menu.Separator className="my-1 border-t border-border" />;
  return <div role="separator" className="my-1 border-t border-border" />;
}

/** Título de un grupo de opciones (no se puede elegir). */
export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3.5 pb-1 pt-1.5 text-eyebrow text-muted-darker">{children}</div>;
}

interface DropdownButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon?: React.ElementType;
  variant?: "default" | "outline";
  size?: "sm" | "md";
  chevron?: boolean;
}

/** Botón estándar para abrir un `Dropdown` (es un `<button>` real). */
export const DropdownButton = React.forwardRef<HTMLButtonElement, DropdownButtonProps>(function DropdownButton(
  { label, icon: Icon, variant = "outline", size = "md", chevron = true, className, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg transition-colors select-none",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
        variant === "outline"
          ? "border border-border hover:bg-surface-light text-foreground data-[popup-open]:bg-surface-light"
          : "bg-surface-light hover:bg-surface text-foreground",
        className
      )}
    >
      {Icon && <Icon size={size === "sm" ? 13 : 15} aria-hidden className="shrink-0 text-muted-darker" />}
      <span className="font-medium">{label}</span>
      {chevron && <ChevronDown size={size === "sm" ? 12 : 14} aria-hidden className="shrink-0 text-muted-darker" />}
    </button>
  );
});
