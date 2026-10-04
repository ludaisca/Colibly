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

interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  success: (message: string, duration?: number) => void;
  error:   (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info:    (message: string, duration?: number) => void;
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

// Sin duración explícita, el tiempo en pantalla crece con el largo del mensaje
// (mínimo 4 s) para que se alcance a leer.
function defaultDuration(message: string): number {
  return Math.max(4000, 2000 + message.length * 50);
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const { border, text, Icon } = TONE_STYLE[toast.tone];
  const total = toast.duration ?? defaultDuration(toast.message);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(total);
  const startedAtRef = useRef(0);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    exitTimerRef.current = setTimeout(() => onDismiss(toast.id), 300);
  }, [onDismiss, toast.id]);

  const start = useCallback(() => {
    if (total === 0 || dismissTimerRef.current) return;
    startedAtRef.current = Date.now();
    dismissTimerRef.current = setTimeout(dismiss, Math.max(remainingRef.current, 0));
  }, [dismiss, total]);

  // Pausar con el puntero encima o el foco dentro: descuenta lo ya transcurrido
  // para retomar con el tiempo que faltaba.
  const pause = useCallback(() => {
    if (!dismissTimerRef.current) return;
    clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = null;
    remainingRef.current -= Date.now() - startedAtRef.current;
  }, []);

  useEffect(() => {
    start();
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [start]);

  return (
    <div
      role={toast.tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => { hoveredRef.current = true; pause(); }}
      onMouseLeave={() => { hoveredRef.current = false; if (!focusedRef.current && !exiting) start(); }}
      onFocus={() => { focusedRef.current = true; pause(); }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        focusedRef.current = false;
        if (!hoveredRef.current && !exiting) start();
      }}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-md",
        "bg-surface",
        border,
        exiting ? "animate-slide-down" : "animate-slide-up",
        "w-full"
      )}
    >
      <Icon size={16} aria-hidden="true" className={cn("mt-0.5 shrink-0", text)} />
      <p className="flex-1 text-foreground">{toast.message}</p>
      {/* Área de 24x24 con icono de 14: el margen negativo conserva el layout. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar notificación"
        className="-my-1 -mr-1.5 grid size-6 shrink-0 place-items-center rounded-md text-muted-darker transition-colors hover:text-foreground"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const mounted = useHasMounted();

  const add = useCallback((tone: ToastTone, message: string, duration?: number) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, tone, message, duration }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = useMemo(() => ({
    success: (msg: string, dur?: number) => add("success", msg, dur),
    error:   (msg: string, dur?: number) => add("danger",  msg, dur),
    warning: (msg: string, dur?: number) => add("warning", msg, dur),
    info:    (msg: string, dur?: number) => add("info",    msg, dur),
  }), [add]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* El contenedor existe siempre: una región viva que aparece junto con su
          primer mensaje no siempre se anuncia. data-react-aria-top-layer evita
          que un modal de React Aria lo oculte (aria-hidden) mientras está abierto. */}
      {mounted && createPortal(
        <div
          data-react-aria-top-layer="true"
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
