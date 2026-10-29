import React from "react";
import { X, CheckCircle, AlertTriangle, Info, XCircle } from "lucide-react";
import { cn } from "./cn";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<Tone, { bg: string; border: string; text: string; Icon: React.ElementType }> = {
  success: { bg: "bg-success-bg", border: "border-success-border", text: "text-success",  Icon: CheckCircle },
  warning: { bg: "bg-warning-bg", border: "border-warning-border", text: "text-warning",  Icon: AlertTriangle },
  danger:  { bg: "bg-danger-bg",  border: "border-danger-border",  text: "text-danger",   Icon: XCircle },
  info:    { bg: "bg-info-bg",    border: "border-info-border",    text: "text-info",      Icon: Info },
  neutral: { bg: "bg-surface-light", border: "border-border",     text: "text-muted",     Icon: Info },
};

interface BannerProps {
  tone?: Tone;
  title?: string;
  icon?: React.ElementType;
  onClose?: () => void;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Banner({
  tone = "neutral",
  title,
  icon,
  onClose,
  action,
  className,
  children,
}: BannerProps) {
  const { bg, border, text, Icon: DefaultIcon } = TONE[tone];
  const Icon = icon ?? DefaultIcon;
  const isDestructive = tone === "danger" || tone === "warning";

  return (
    <div
      role={isDestructive ? "alert" : "status"}
      className={cn(
        "flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        bg,
        border,
        className
      )}
    >
      <Icon size={16} className={cn("mt-0.5 shrink-0", text)} />
      <div className="flex-1 min-w-0">
        {title && <p className={cn("font-medium mb-0.5", text)}>{title}</p>}
        <div className="text-foreground/80">{children}</div>
        {action && <div className="mt-1.5">{action}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-darker transition-colors hover:text-foreground"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
