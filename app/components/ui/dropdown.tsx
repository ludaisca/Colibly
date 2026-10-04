"use client";

import React, { createContext, useContext, useId, useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

// Dentro de un menú los DropdownItem son role=menuitem; en un popover con
// formularios u otro contenido libre son botones normales.
const MenuContext = createContext(false);

// El contenido es "un menú" solo si está hecho únicamente de DropdownItem /
// DropdownDivider (a través de Fragments y arreglos). Cualquier otra cosa
// (inputs, texto, wrappers) lo vuelve un popover tipo diálogo no modal.
function isMenuContent(children: React.ReactNode): boolean {
  let items = 0;
  const walk = (nodes: React.ReactNode): boolean => {
    for (const node of React.Children.toArray(nodes)) {
      if (!React.isValidElement(node)) return false;
      if (node.type === React.Fragment) {
        if (!walk((node.props as { children?: React.ReactNode }).children)) return false;
      } else if (node.type === DropdownItem) {
        items++;
      } else if (node.type !== DropdownDivider) {
        return false;
      }
    }
    return true;
  };
  return walk(children) && items > 0;
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  portal?: boolean;
  closeOnSelect?: boolean;
  /** Nombre accesible del panel; sin él se usa el texto del disparador. */
  menuLabel?: string;
}

export function Dropdown({
  trigger,
  children,
  align = "left",
  className,
  open: controlledOpen,
  onOpenChange,
  portal = false,
  closeOnSelect = true,
  menuLabel,
}: DropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusedForOpenRef = useRef(false);
  const triggerId = useId();
  const menuId = useId();
  const isMenu = isMenuContent(children);
  const [portalPosition, setPortalPosition] = useState<{ top: number; left: number } | null>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Igual que modal.tsx: "visible" se mantiene true durante la animación de
  // salida para no desmontar de golpe — solo baja a false al terminar
  // animate-scale-out (onAnimationEnd).
  const [visible, setVisible] = useState(isOpen);
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) setVisible(true);
  }
  const handleAnimationEnd = useCallback(() => {
    if (!isOpen) setVisible(false);
  }, [isOpen]);

  const toggle = useCallback(() => setOpen(!isOpen), [isOpen, setOpen]);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const triggerIsNativeControl = React.isValidElement(trigger) && (trigger.type === "button" || trigger.type === "a");

  // El elemento que recibe el foco al volver: el botón nativo del disparador o,
  // si el disparador no es un control nativo, el propio contenedor con role=button.
  const focusTrigger = useCallback(() => {
    const host = triggerRef.current;
    if (!host) return;
    const native = host.querySelector<HTMLElement>("button, a[href]");
    (triggerIsNativeControl && native ? native : host).focus({ preventScroll: true });
  }, [triggerIsNativeControl]);

  // Al abrir, el foco entra al panel: al primer elemento del menú o, en un
  // popover libre, al primer control (o al propio panel si no hay ninguno).
  // Espera a que el panel sea visible (en portal nace oculto hasta medirse).
  useEffect(() => {
    if (!isOpen) {
      focusedForOpenRef.current = false;
      return;
    }
    const menuEl = menuRef.current;
    if (!menuEl || focusedForOpenRef.current || (portal && !portalPosition)) return;
    focusedForOpenRef.current = true;
    if (menuEl.contains(document.activeElement)) return;
    const first = menuEl.querySelector<HTMLElement>(isMenu ? '[role="menuitem"]:not(:disabled)' : FOCUSABLE);
    (first ?? menuEl).focus({ preventScroll: true });
  }, [isOpen, visible, portal, portalPosition, isMenu]);

  const updatePortalPosition = useCallback(() => {
    if (!portal || !ref.current || !menuRef.current) return;
    const anchor = ref.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const left = Math.max(8, Math.min(
      align === "right" ? anchor.right - menu.width : anchor.left,
      window.innerWidth - menu.width - 8
    ));
    const below = anchor.bottom + 6;
    const above = anchor.top - menu.height - 6;
    const openAbove = below + menu.height > viewportHeight - 8 && anchor.top > viewportHeight - anchor.bottom;
    const top = Math.max(8, Math.min(openAbove ? above : below, viewportHeight - menu.height - 8));
    setPortalPosition((previous) => previous?.top === top && previous.left === left ? previous : { top, left });
  }, [align, portal]);

  useLayoutEffect(() => {
    if (!visible || !portal) return;
    updatePortalPosition();
    const observer = new ResizeObserver(updatePortalPosition);
    if (menuRef.current) observer.observe(menuRef.current);
    window.addEventListener("resize", updatePortalPosition);
    window.addEventListener("scroll", updatePortalPosition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePortalPosition);
      window.removeEventListener("scroll", updatePortalPosition, true);
    };
  }, [visible, portal, updatePortalPosition]);

  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    function handler(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Solo se devuelve el foco si estaba en este dropdown (o en ninguna
      // parte); un Escape pulsado en otro lugar no debe robárselo.
      const active = document.activeElement;
      const here = !active || active === document.body || !!menuRef.current?.contains(active) || !!ref.current?.contains(active);
      close();
      if (here) focusTrigger();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close, focusTrigger]);

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const menuEl = menuRef.current;
    if (!menuEl) return;
    if (e.key === "Tab") {
      const items = Array.from(menuEl.querySelectorAll<HTMLElement>(isMenu ? '[role="menuitem"]:not(:disabled)' : FOCUSABLE));
      const active = document.activeElement;
      const leaving = isMenu || (e.shiftKey ? active === items[0] || active === menuEl : active === items[items.length - 1]);
      if (leaving) {
        // El foco vuelve al disparador antes de que Tab lo mueva, así sigue al
        // siguiente/anterior elemento de la página en vez de perderse.
        close();
        focusTrigger();
      }
      return;
    }
    if (!isMenu) return;
    const items = Array.from(menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = (index + 1) % items.length;
    else if (e.key === "ArrowUp") next = index <= 0 ? items.length - 1 : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next !== null) {
      e.preventDefault();
      items[next].focus();
    }
  }

  const menu = visible && (
    <div
      ref={menuRef}
      id={menuId}
      role={isMenu ? "menu" : "dialog"}
      aria-label={menuLabel}
      aria-labelledby={menuLabel ? undefined : triggerId}
      tabIndex={-1}
      onKeyDown={onMenuKeyDown}
      className={cn(
        "z-[70] mt-1.5 min-w-[180px] rounded-xl border border-border bg-surface shadow-lg py-1 focus:outline-none",
        portal ? "fixed max-h-[calc(100dvh-16px)] max-w-[calc(100vw-16px)] overflow-y-auto" : "absolute",
        isOpen ? "animate-scale-in" : "animate-scale-out",
        !portal && (align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left")
      )}
      style={portal ? { top: portalPosition?.top ?? 0, left: portalPosition?.left ?? 0, visibility: portalPosition ? "visible" : "hidden", marginTop: 0 } : undefined}
      onClick={closeOnSelect ? close : undefined}
      onAnimationEnd={handleAnimationEnd}
    >
      <MenuContext.Provider value={isMenu}>{children}</MenuContext.Provider>
    </div>
  );

  // aria del disparador: se inyectan en el botón nativo (que es el que recibe
  // el foco) o, si no lo es, en el contenedor con role=button.
  const popupProps = {
    "aria-haspopup": isMenu ? ("menu" as const) : ("dialog" as const),
    "aria-expanded": isOpen,
    "aria-controls": isOpen && visible ? menuId : undefined,
  };
  const renderedTrigger = triggerIsNativeControl
    ? React.cloneElement(trigger as React.ReactElement<Record<string, unknown>>, popupProps)
    : trigger;

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <div
        ref={triggerRef}
        id={triggerId}
        role={triggerIsNativeControl ? undefined : "button"}
        tabIndex={triggerIsNativeControl ? undefined : 0}
        {...(triggerIsNativeControl ? {} : popupProps)}
        onClick={toggle}
        onKeyDown={(e) => {
          if (!triggerIsNativeControl && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); }
          else if (e.key === "ArrowDown" && !isOpen) { e.preventDefault(); setOpen(true); }
        }}
        className="cursor-pointer"
      >
        {renderedTrigger}
      </div>
      {portal && typeof document !== "undefined" ? createPortal(menu, document.body) : menu}
    </div>
  );
}

interface DropdownItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ElementType;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}

export function DropdownItem({
  children,
  onClick,
  icon: Icon,
  danger,
  disabled,
  className,
}: DropdownItemProps) {
  const inMenu = useContext(MenuContext);
  return (
    <button
      type="button"
      role={inMenu ? "menuitem" : undefined}
      tabIndex={inMenu ? -1 : undefined}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors",
        danger
          ? "text-danger hover:bg-danger-bg"
          : "text-foreground hover:bg-surface-light",
        disabled && "opacity-40 cursor-not-allowed",
        className
      )}
    >
      {Icon && <Icon size={15} aria-hidden="true" className={danger ? "text-danger" : "text-muted-darker"} />}
      {children}
    </button>
  );
}

export function DropdownDivider() {
  const inMenu = useContext(MenuContext);
  return <div role={inMenu ? "separator" : undefined} className="my-1 border-t border-border" />;
}

interface DropdownButtonProps {
  label: string;
  icon?: React.ElementType;
  variant?: "default" | "outline";
  size?: "sm" | "md";
  chevron?: boolean;
  className?: string;
}

export function DropdownButton({
  label,
  icon: Icon,
  variant = "outline",
  size = "md",
  chevron = true,
  className,
}: DropdownButtonProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg transition-colors select-none",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
        variant === "outline"
          ? "border border-border hover:bg-surface-light text-foreground"
          : "bg-surface-light hover:bg-surface text-foreground",
        className
      )}
    >
      {Icon && <Icon size={size === "sm" ? 13 : 15} className="text-muted-darker" />}
      <span className="font-medium">{label}</span>
      {chevron && <ChevronDown size={size === "sm" ? 12 : 14} className="text-muted-darker" />}
    </div>
  );
}
