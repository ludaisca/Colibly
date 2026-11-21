"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";

// Adaptador (rediseño con Astryx): misma API de siempre, dibujado por Astryx.
// - Escritorio: Dialog centrado, o Drawer lateral con `layout="drawer"`.
// - Celular (< 768 px): BottomSheet (hoja inferior), o Drawer a ancho completo.
// Reglas de siempre (docs/INVENTARIO_MODALES_2026-11-07.md): un modal solo
// cuando la tarea interrumpe con razón; `drawer` para formularios de 6+
// campos; `kind="alert"` (ConfirmDialog) no se cierra tocando fuera.

type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: ModalSize;
  persistent?: boolean;
  kind?: "standard" | "alert";
  /** "dialog" (centrado; hoja inferior en el celular) o "drawer" (cajón lateral derecho). */
  layout?: "dialog" | "drawer";
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

const DIALOG_WIDTH: Record<ModalSize, number> = { sm: 400, md: 520, lg: 720, xl: 960 };
const DRAWER_WIDTH: Record<ModalSize, number> = { sm: 400, md: 480, lg: 640, xl: 800 };

const WIDE = "(min-width: 768px)";
function useIsWide() {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(WIDE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia(WIDE).matches,
    () => true,
  );
}

/**
 * Astryx deja montado el <dialog> cerrado. Dentro de un contenedor `space-y-*`
 * eso cambia cuál hijo es el último y mete márgenes en pantallas existentes
 * (Base UI no montaba nada cerrado). Se monta al abrir y se desmonta cuando
 * termina la animación de cierre.
 */
function useMountedWhileOpen(open: boolean, exitMs = 300) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, mounted, exitMs]);
  return mounted;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  persistent = false,
  kind = "standard",
  layout = "dialog",
  footer,
  className,
  children,
}: ModalProps) {
  const isWide = useIsWide();
  const mounted = useMountedWhileOpen(open);
  const alert = kind === "alert";
  // persistent: no se puede cerrar; alert: no se cierra tocando fuera ni con Esc.
  const purpose = persistent || alert ? "required" : "info";
  const canClose = !persistent && !alert;
  const onOpenChange = (next: boolean) => {
    if (!next && !persistent) onClose();
  };
  const label = title ?? "Ventana de diálogo";

  if (!mounted) return null;

  const body = (
    <VStack gap={4} padding={4} className={className}>
      {children}
      {footer && (
        <HStack gap={2} hAlign="end" wrap="wrap">
          {footer}
        </HStack>
      )}
    </VStack>
  );

  if (layout === "drawer") {
    return (
      <Drawer
        isOpen={open}
        onOpenChange={onOpenChange}
        label={label}
        width={DRAWER_WIDTH[size]}
        purpose={purpose}
        experimental={{ isFullWidthOnMobile: true }}
      >
        {title && (
          <DrawerHeader title={title} subtitle={description} onOpenChange={canClose ? onOpenChange : undefined} />
        )}
        {body}
      </Drawer>
    );
  }

  if (!isWide) {
    return (
      <BottomSheet isOpen={open} onOpenChange={onOpenChange} label={label} purpose={purpose} height="hug">
        {(title || description) && (
          <VStack gap={1} paddingInline={4} paddingBlock={3}>
            {title && <Heading level={2}>{title}</Heading>}
            {description && <Text type="supporting" color="secondary">{description}</Text>}
          </VStack>
        )}
        {body}
      </BottomSheet>
    );
  }

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      width={DIALOG_WIDTH[size]}
      maxHeight="85dvh"
      purpose={purpose}
      aria-label={title ? undefined : label}
    >
      {(title || description || canClose) && (
        <DialogHeader title={title} subtitle={description} onOpenChange={canClose ? onOpenChange : undefined} />
      )}
      {body}
    </Dialog>
  );
}
