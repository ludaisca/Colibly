"use client";

import React, { createContext, useContext } from "react";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuDivider,
  DropdownMenuGroup,
  type DropdownMenuTriggerProps,
} from "@astryxdesign/core/DropdownMenu";
import { Popover } from "@astryxdesign/core/Popover";
import { Button as AxButton } from "@astryxdesign/core/Button";
import { Icon as AxIcon, type IconType } from "@astryxdesign/core/Icon";
import { cn } from "./cn";

// Adaptador (rediseño con Astryx): misma API de siempre (`trigger`, `align`,
// `open`, `onOpenChange`, `closeOnSelect`, `panel`, `className`).
// - `Dropdown` (por defecto) es un menú de acciones → DropdownMenu de Astryx
//   (roles menu/menuitem, flechas, Escape, foco de vuelta, hoja inferior en
//   el celular).
// - `Dropdown panel` es un panel con contenido propio → Popover de Astryx.
//   Dentro de un panel, `DropdownItem` es un botón normal.
// El disparador es el elemento de siempre: recibe las props de Astryx.

type Mode = "menu" | "panel";

const DropdownContext = createContext<{ mode: Mode; closeOnSelect: boolean; close: () => void } | null>(null);

const ITEM =
  "w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left outline-none transition-colors select-none cursor-default rounded-sm disabled:opacity-40 disabled:cursor-not-allowed";

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Sin efecto: se acepta por compatibilidad. */
  portal?: boolean;
  /** Menú: cerrar al elegir una opción. Panel: cerrar con cualquier clic dentro. */
  closeOnSelect?: boolean;
  /** Panel con contenido propio (Popover) en lugar de menú de acciones. */
  panel?: boolean;
  /** Nombre accesible del panel (por defecto, ninguno). */
  panelLabel?: string;
}

type AnyProps = Record<string, unknown>;

/** Funde las props que Astryx da al disparador con las que ya trae el elemento:
 * los manejadores se encadenan (primero el del elemento) y las refs se unen. */
function mergeTriggerProps(own: AnyProps, given: AnyProps, ownRef: unknown): AnyProps {
  const out: AnyProps = { ...own, ...given };
  for (const key of Object.keys(given)) {
    const a = own[key];
    const b = given[key];
    if (/^on[A-Z]/.test(key) && typeof a === "function" && typeof b === "function") {
      out[key] = (...args: unknown[]) => {
        (a as (...x: unknown[]) => void)(...args);
        (b as (...x: unknown[]) => void)(...args);
      };
    }
  }
  const refs = [ownRef, given.ref].filter(Boolean);
  out.ref = (node: HTMLElement | null) => {
    for (const r of refs) {
      if (typeof r === "function") r(node);
      else if (r && typeof r === "object") (r as React.RefObject<HTMLElement | null>).current = node;
    }
  };
  return out;
}

/** Disparador: un elemento (botón o componente con ref) se usa tal cual con
 * las props de Astryx; cualquier otro contenido va dentro de un botón sin estilo. */
function renderTriggerFor(trigger: React.ReactNode, className?: string) {
  return function RenderTrigger(props: DropdownMenuTriggerProps | AnyProps) {
    const given = props as AnyProps;
    if (React.isValidElement<AnyProps>(trigger) && typeof trigger.type !== "symbol") {
      const ownRef = (trigger.props as AnyProps).ref;
      return React.cloneElement(trigger, mergeTriggerProps(trigger.props, given, ownRef));
    }
    return (
      <button
        type="button"
        {...(given as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        ref={given.ref as React.Ref<HTMLButtonElement>}
        className={cn("inline-flex max-w-full cursor-pointer rounded-lg text-left", className)}
      >
        {trigger}
      </button>
    );
  };
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
  const ctx = React.useMemo(
    () => ({ mode: (panel ? "panel" : "menu") as Mode, closeOnSelect, close }),
    [panel, closeOnSelect, close]
  );
  const alignment = align === "right" ? "end" : "start";
  const wrapperClass = cn("relative inline-flex max-w-full", className);

  if (panel) {
    return (
      <DropdownContext.Provider value={ctx}>
        <span className={wrapperClass}>
          <Popover
            isOpen={isOpen}
            onOpenChange={setOpen}
            placement="below"
            alignment={alignment}
            label={panelLabel}
            padding={0}
            presentation="adaptive"
            closeButtonLabel="Cerrar"
            content={
              <div className="py-1" onClick={closeOnSelect ? close : undefined}>
                {children}
              </div>
            }
          >
            {/* El Popover conecta su propio disparador: va el elemento tal cual. */}
            {React.isValidElement(trigger) ? (
              trigger
            ) : (
              <button type="button" className="inline-flex max-w-full cursor-pointer rounded-lg text-left">
                {trigger}
              </button>
            )}
          </Popover>
        </span>
      </DropdownContext.Provider>
    );
  }

  return (
    <DropdownContext.Provider value={ctx}>
      <span className={wrapperClass}>
        <DropdownMenu
          isMenuOpen={isOpen}
          onOpenChange={setOpen}
          placement="below"
          alignment={alignment}
          renderTrigger={renderTriggerFor(trigger)}
        >
          {children}
        </DropdownMenu>
      </span>
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

  if (ctx?.mode === "menu") {
    return (
      <DropdownMenuItem
        label={children}
        icon={Icon as IconType | undefined}
        variant={danger ? "destructive" : "default"}
        isDisabled={disabled}
        hasCloseOnSelect={keepOpen ? false : ctx.closeOnSelect}
        onClick={() => onClick?.()}
        // Las pantallas lo usan para esconder la opción según el ancho
        // (p. ej. "sm:hidden" cuando el botón equivalente ya está visible).
        className={className}
      />
    );
  }

  const tone = danger ? "text-danger hover:bg-danger-bg" : "text-foreground hover:bg-surface-light focus-visible:bg-surface-light";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(ITEM, tone, className)}>
      {Icon && <Icon size={15} aria-hidden className={cn("shrink-0", danger ? "text-danger" : "text-muted-darker")} />}
      {children}
    </button>
  );
}

export function DropdownDivider() {
  const ctx = useContext(DropdownContext);
  if (ctx?.mode === "menu") return <DropdownMenuDivider />;
  return <div role="separator" className="my-1 border-t border-border" />;
}

/** Título de un grupo de opciones (no se puede elegir). */
export function DropdownLabel({ children }: { children: React.ReactNode }) {
  const ctx = useContext(DropdownContext);
  if (ctx?.mode === "menu") return <DropdownMenuGroup title={children} />;
  return <div className="px-3.5 pb-1 pt-1.5 text-micro text-muted-darker">{children}</div>;
}

interface DropdownButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  label: string;
  icon?: React.ElementType;
  variant?: "default" | "outline";
  size?: "sm" | "md";
  chevron?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

/** Botón estándar para abrir un `Dropdown` (Button de Astryx con chevron). */
export function DropdownButton({
  label,
  icon,
  variant = "outline",
  size = "md",
  chevron = true,
  className,
  disabled,
  type,
  ...props
}: DropdownButtonProps) {
  return (
    <AxButton
      {...(props as AnyProps)}
      label={label}
      icon={icon ? <AxIcon icon={icon as IconType} /> : undefined}
      endContent={chevron ? <AxIcon icon="chevronDown" /> : undefined}
      variant={variant === "outline" ? "secondary" : "ghost"}
      size={size === "sm" ? "sm" : "md"}
      isDisabled={disabled}
      type={type === "submit" ? "submit" : "button"}
      className={className}
    />
  );
}
