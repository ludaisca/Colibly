"use client";

import React from "react";
import { Drawer as AxDrawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { BottomSheet } from "@astryxdesign/core/BottomSheet";

// Adaptador (rediseño con Astryx): panel lateral (Drawer de Astryx) o hoja
// inferior (BottomSheet) con la API de siempre.

type DrawerSide = "left" | "right" | "bottom";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  title?: string;
  /** Título solo para lectores de pantalla cuando el contenido trae su propia cabecera. */
  srTitle?: string;
  /** Ancho (lados izquierdo/derecho) como clase de Tailwind: `w-64`, `w-full sm:w-[440px]`. */
  width?: string;
  className?: string;
  children: React.ReactNode;
}

/** Ancho de escritorio en px a partir de la clase de siempre (w-64 = 256 px). */
function widthOf(width: string | undefined): number {
  const px = width?.match(/w-\[(\d+)px\]/);
  if (px) return Number(px[1]);
  const step = width?.match(/(?:^|\s)w-(\d+)(?:\s|$)/);
  return step ? Number(step[1]) * 4 : 288;
}

export function Drawer({ open, onClose, side = "left", title, srTitle, width, className, children }: DrawerProps) {
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };
  const label = title ?? srTitle ?? (side === "left" ? "Navegación" : "Panel de detalles");

  if (side === "bottom") {
    return (
      <BottomSheet isOpen={open} onOpenChange={onOpenChange} label={label} height="tall" padding={0}>
        <div className={className}>{children}</div>
      </BottomSheet>
    );
  }

  return (
    <AxDrawer
      isOpen={open}
      onOpenChange={onOpenChange}
      label={label}
      side={side === "left" ? "start" : "end"}
      width={widthOf(width)}
      padding={0}
      experimental={{ isFullWidthOnMobile: width?.includes("w-full") ?? false }}
    >
      {title && <DrawerHeader title={title} onOpenChange={onOpenChange} />}
      <div className={className}>{children}</div>
    </AxDrawer>
  );
}
