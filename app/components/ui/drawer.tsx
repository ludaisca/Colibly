"use client";

import React from "react";
import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { cn } from "./cn";
import "./drawer.css";

type DrawerSide = "left" | "right" | "bottom";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  title?: string;
  /** Título solo para lectores de pantalla cuando el contenido trae su propia cabecera. */
  srTitle?: string;
  /** Ancho (lados izquierdo/derecho) o alto (abajo), como clase de Tailwind. */
  width?: string;
  className?: string;
  children: React.ReactNode;
}

export function Drawer({
  open,
  onClose,
  side = "left",
  title,
  srTitle,
  width,
  className,
  children,
}: DrawerProps) {
  return (
    <BaseDrawer.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} swipeDirection={side === "bottom" ? "down" : side}>
      <BaseDrawer.Portal>
        <BaseDrawer.Backdrop className="colibly-drawer-backdrop" />
        <BaseDrawer.Viewport className={cn("colibly-drawer-viewport", width ?? (side === "bottom" ? "h-[88svh]" : "w-72"))} data-side={side}>
          <BaseDrawer.Popup className={cn("colibly-drawer-popup", className)} data-side={side}>
            <BaseDrawer.Content className="flex h-full min-h-0 flex-col">
              {/* Hoja inferior: asa para arrastrar hacia abajo y cerrar. */}
              {side === "bottom" && <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border" />}
              {title ? (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <BaseDrawer.Title className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</BaseDrawer.Title>
                  <BaseDrawer.Close aria-label="Cerrar panel" className="colibly-drawer-close"><X size={18} /></BaseDrawer.Close>
                </div>
              ) : (
                <BaseDrawer.Title className="sr-only">{srTitle ?? (side === "left" ? "Navegación" : "Panel de detalles")}</BaseDrawer.Title>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            </BaseDrawer.Content>
          </BaseDrawer.Popup>
        </BaseDrawer.Viewport>
      </BaseDrawer.Portal>
    </BaseDrawer.Root>
  );
}
