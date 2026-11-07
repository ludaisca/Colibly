"use client";

import React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { X } from "lucide-react";
import { cn } from "./cn";
import "./modal.css";

// Ventana de diálogo sobre Base UI (2026-11-07; antes HeroUI). API sin
// cambios. Reglas (docs/INVENTARIO_MODALES_2026-11-07.md):
// - Un modal solo cuando la tarea interrumpe con razón: secreto de una sola
//   vez, seguridad, acción irreversible, bloquear hasta completar datos.
// - `layout="drawer"`: cajón lateral para formularios largos (6+ campos) y
//   paneles de consulta; deja ver la página detrás en escritorio y ocupa la
//   pantalla completa en el celular.
// - En el celular el modal normal es una hoja inferior.
// - `kind="alert"` (ConfirmDialog) usa AlertDialog: no se cierra tocando fuera.

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
  const alert = kind === "alert";
  // El modal se abre por estado (no con Dialog.Trigger), así que Base UI no
  // sabe a dónde devolver el foco al cerrar: se recuerda el último elemento
  // enfocado mientras estaba cerrado (normalmente el botón que lo abrió).
  // Si el modal se monta ya abierto (`{editing && <XxxModal open />}`), el
  // foco todavía está en el botón durante este primer render.
  const [initialFocused] = React.useState<HTMLElement | null>(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null
  );
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (open) return;
    const remember = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) returnFocusRef.current = event.target;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, [open]);
  const Parts = alert ? AlertDialog : Dialog;
  const onOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !persistent) onClose();
  };

  return (
    <Parts.Root open={open} onOpenChange={onOpenChange} {...(alert ? {} : { disablePointerDismissal: persistent })}>
      <Parts.Portal>
        <Parts.Backdrop className="colibly-modal-backdrop" />
        <Parts.Viewport className="colibly-modal-viewport" data-layout={layout}>
          <Parts.Popup
            className={cn("colibly-modal-dialog", className)}
            data-colibly-size={size}
            data-layout={layout}
            aria-label={title ? undefined : "Ventana de diálogo"}
            finalFocus={() => {
              const target = returnFocusRef.current ?? initialFocused;
              return target?.isConnected ? target : true;
            }}
          >
            {(title || description || !persistent) && (
              <div className="colibly-modal-header">
                <div className="min-w-0">
                  {title && <Parts.Title className="text-base font-semibold text-foreground">{title}</Parts.Title>}
                  {description && <Parts.Description className="mt-1 text-sm text-muted">{description}</Parts.Description>}
                </div>
                {!persistent && !alert && (
                  <Parts.Close aria-label="Cerrar" className="colibly-modal-close">
                    <X size={18} aria-hidden />
                  </Parts.Close>
                )}
              </div>
            )}
            <div className="colibly-modal-body">{children}</div>
            {footer && <div className="colibly-modal-footer">{footer}</div>}
          </Parts.Popup>
        </Parts.Viewport>
      </Parts.Portal>
    </Parts.Root>
  );
}
