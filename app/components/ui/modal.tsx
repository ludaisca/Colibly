"use client";

import React from "react";
import { AlertDialog, Modal as HeroModal } from "@heroui/react";
import { X } from "lucide-react";
import { cn } from "./cn";
import "./modal.css";

type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: ModalSize;
  persistent?: boolean;
  kind?: "standard" | "alert";
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
  footer,
  className,
  children,
}: ModalProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const alert = kind === "alert";
  const requestClose = (nextOpen: boolean) => {
    if (!nextOpen && !persistent) onClose();
  };

  const content = (
    <>
      {(title || description || !persistent) && (
        <div className="colibly-modal-header">
          <div className="min-w-0">
            {title && <h2 id={titleId} className="text-base font-semibold text-foreground">{title}</h2>}
            {description && <p id={descriptionId} className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {!persistent && !alert && (
            <button type="button" onClick={onClose} aria-label="Cerrar" className="colibly-modal-close">
              <X size={18} />
            </button>
          )}
        </div>
      )}
      <div className="colibly-modal-body">{children}</div>
      {footer && <div className="colibly-modal-footer">{footer}</div>}
    </>
  );

  const dialogProps = {
    "aria-labelledby": title ? titleId : undefined,
    "aria-label": title ? undefined : "Ventana de diálogo",
    "aria-describedby": description ? descriptionId : undefined,
    "data-colibly-size": size,
    className: cn("colibly-modal-dialog", className),
  };

  if (alert) {
    return (
      <AlertDialog.Backdrop
        isOpen={open}
        onOpenChange={requestClose}
        isDismissable={false}
        isKeyboardDismissDisabled
        className="colibly-modal-backdrop"
      >
        <AlertDialog.Container className="colibly-modal-container">
          <AlertDialog.Dialog {...dialogProps}>{content}</AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    );
  }

  return (
    <HeroModal.Backdrop
      isOpen={open}
      onOpenChange={requestClose}
      isDismissable={!persistent}
      isKeyboardDismissDisabled={persistent}
      className="colibly-modal-backdrop"
    >
      <HeroModal.Container className="colibly-modal-container" scroll="inside">
        <HeroModal.Dialog {...dialogProps}>{content}</HeroModal.Dialog>
      </HeroModal.Container>
    </HeroModal.Backdrop>
  );
}
