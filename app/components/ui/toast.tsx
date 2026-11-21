"use client";

import React, { createContext, useContext, useMemo } from "react";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { useToast as useAxToast } from "@astryxdesign/core/Toast";
import { Button as AxButton } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/Layout";
import { Icon as AxIcon } from "@astryxdesign/core/Icon";

// Adaptador (rediseño con Astryx): misma API de siempre
// (`const { success, error } = useToast()`), dibujado por los toasts de Astryx.
// - success / info / warning → toast "info" de Astryx (con ícono que los distingue).
// - error → toast "error": se queda hasta que la persona lo cierra (WCAG 2.2.1;
//   antes se iba a los 4 s y un error podía pasar sin leerse).
// - `action` (p. ej. "Deshacer") → botón al final que ejecuta y cierra el toast.

type ToastTone = "success" | "warning" | "danger" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** Segundo argumento: la duración en ms (forma original) o un objeto con acción. */
export type ToastOptions = number | { duration?: number; action?: ToastAction };

interface ToastContextValue {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TONE_ICON = { success: CheckCircle, warning: AlertTriangle } as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const showToast = useAxToast();

  const value = useMemo<ToastContextValue>(() => {
    const add = (tone: ToastTone, message: string, options?: ToastOptions) => {
      const { duration, action } =
        typeof options === "number" ? { duration: options, action: undefined } : (options ?? {});
      const icon = tone === "success" || tone === "warning" ? TONE_ICON[tone] : null;
      // Con acción hay que dar tiempo de usarla: 4 s es poco para "Deshacer".
      const ms = duration ?? (action ? 8000 : 4000);
      // El botón de acción cierra su propio toast: el cierre llega después.
      const handle: { dismiss?: () => void } = {};
      handle.dismiss = showToast({
        type: tone === "danger" ? "error" : "info",
        body: icon ? (
          <HStack gap={2} vAlign="center">
            <AxIcon icon={icon} />
            {message}
          </HStack>
        ) : (
          message
        ),
        // duration 0 = no se oculta solo (como antes).
        ...(tone === "danger" ? {} : { isAutoHide: ms !== 0, autoHideDuration: ms || undefined }),
        endContent: action ? (
          <AxButton
            label={action.label}
            size="sm"
            variant="ghost"
            onClick={() => {
              action.onClick();
              handle.dismiss?.();
            }}
          />
        ) : undefined,
      });
    };
    return {
      success: (msg, opt) => add("success", msg, opt),
      error: (msg, opt) => add("danger", msg, opt),
      warning: (msg, opt) => add("warning", msg, opt),
      info: (msg, opt) => add("info", msg, opt),
    };
  }, [showToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
