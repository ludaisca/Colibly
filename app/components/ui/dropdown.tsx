"use client";

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  portal?: boolean;
  closeOnSelect?: boolean;
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
}: DropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  const menu = visible && (
    <div
      ref={menuRef}
      className={cn(
        "z-[70] mt-1.5 min-w-[180px] rounded-xl border border-border bg-surface shadow-lg py-1",
        portal ? "fixed max-h-[calc(100dvh-16px)] max-w-[calc(100vw-16px)] overflow-y-auto" : "absolute",
        isOpen ? "animate-scale-in" : "animate-scale-out",
        !portal && (align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left")
      )}
      style={portal ? { top: portalPosition?.top ?? 0, left: portalPosition?.left ?? 0, visibility: portalPosition ? "visible" : "hidden", marginTop: 0 } : undefined}
      onClick={closeOnSelect ? close : undefined}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  );

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <div
        role={triggerIsNativeControl ? undefined : "button"}
        tabIndex={triggerIsNativeControl ? undefined : 0}
        onClick={toggle}
        onKeyDown={triggerIsNativeControl ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
        className="cursor-pointer"
      >
        {trigger}
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
  return (
    <button
      type="button"
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
      {Icon && <Icon size={15} className={danger ? "text-danger" : "text-muted-darker"} />}
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="my-1 border-t border-border" />;
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
