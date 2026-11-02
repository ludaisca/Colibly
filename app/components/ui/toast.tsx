"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, AlertTriangle, Info, XCircle } from "lucide-react";
import { cn } from "./cn";
import { useHasMounted } from "@/app/hooks/use-has-mounted";

type ToastTone = "success" | "warning" | "danger" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** Segundo argumento: la duración en ms (forma original) o un objeto con acción. */
export type ToastOptions = number | { duration?: number; action?: ToastAction };

interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  duration?: number;
  /** Botón junto al mensaje, p. ej. "Deshacer" tras una acción reversible. */
  action?: ToastAction;
}

interface ToastContextValue {
  success: (message: string, options?: ToastOptions) => void;
  error:   (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  info:    (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TONE_STYLE: Record<ToastTone, { bg: string; border: string; text: string; Icon: React.ElementType }> = {
  success: { bg: "bg-success-bg", border: "border-success-border", text: "text-success", Icon: CheckCircle },
  warning: { bg: "bg-warning-bg", border: "border-warning-border", text: "text-warning", Icon: AlertTriangle },
  danger:  { bg: "bg-danger-bg",  border: "border-danger-border",  text: "text-danger",  Icon: XCircle },
  info:    { bg: "bg-info-bg",    border: "border-info-border",    text: "text-info",    Icon: Info },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const { border, text, Icon } = TONE_STYLE[toast.tone];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    timerRef.current = setTimeout(() => onDismiss(toast.id), 300);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    const duration = toast.duration ?? 4000;
    if (duration === 0) return;
    timerRef.current = setTimeout(dismiss, duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [dismiss, toast.duration]);

  return (
    <div
      role="status"
      aria-live={toast.tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-md",
        "bg-surface",
        border,
        exiting ? "animate-slide-down" : "animate-slide-up",
        "w-full"
      )}
    >
      <Icon size={16} className={cn("mt-0.5 shrink-0", text)} />
      <p className="flex-1 text-foreground">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => { toast.action!.onClick(); dismiss(); }}
          className="shrink-0 text-sm font-semibold text-accent-ink underline-offset-2 hover:underline focus-visible:underline"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Cerrar"
        className="text-muted-darker hover:text-foreground transition-colors mt-0.5 shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const mounted = useHasMounted();

  const add = useCallback((tone: ToastTone, message: string, options?: ToastOptions) => {
    const id = `${Date.now()}-${Math.random()}`;
    const { duration, action } = typeof options === "number" ? { duration: options, action: undefined } : (options ?? {});
    // Con acción hay que dar tiempo de usarla: 4 s es poco para "Deshacer".
    setToasts((prev) => [...prev, { id, tone, message, duration: duration ?? (action ? 8000 : undefined), action }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = useMemo(() => ({
    success: (msg: string, opt?: ToastOptions) => add("success", msg, opt),
    error:   (msg: string, opt?: ToastOptions) => add("danger",  msg, opt),
    warning: (msg: string, opt?: ToastOptions) => add("warning", msg, opt),
    info:    (msg: string, opt?: ToastOptions) => add("info",    msg, opt),
  }), [add]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted && toasts.length > 0 && createPortal(
        <div
          aria-live="polite"
          className={cn(
            "fixed z-[60] flex flex-col gap-2 pointer-events-none",
            "bottom-4 left-4 right-4 md:left-auto md:right-4 md:top-4 md:bottom-auto md:w-80 md:max-w-sm"
          )}
        >
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem toast={t} onDismiss={dismiss} />
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
