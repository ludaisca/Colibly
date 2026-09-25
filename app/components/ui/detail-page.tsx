"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "./cn";

// Plantilla compartida de página de detalle (cuentas/[id], bots/[id], etc.):
// back-link + título (+ badge) + tabs opcionales + contenido. Sustituye al
// patrón repetido de header manual + <Card> apilados — el contenido del
// caller debe separar sus propias secciones con <SectionHeader>, no <Card>.

export interface DetailTab {
  id: string;
  label: string;
}

interface DetailPageProps {
  backHref: string;
  backLabel?: string;
  title: string;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: DetailTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  maxWidth?: string;
  children: React.ReactNode;
  className?: string;
}

export function DetailPage({
  backHref,
  backLabel = "Volver",
  title,
  badge,
  description,
  actions,
  tabs,
  activeTab,
  onTabChange,
  maxWidth = "max-w-2xl",
  children,
  className,
}: DetailPageProps) {
  return (
    <div className={cn("mx-auto space-y-6", maxWidth, className)}>
      <div>
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          {backLabel}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-page-title font-semibold tracking-tight">{title}</h1>
              {badge}
            </div>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>
      </div>

      {tabs && (
        <div className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange?.(t.id)}
              className={cn(
                "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                activeTab === t.id
                  ? "border-accent-strong text-accent-ink"
                  : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}

// Fila label/value para bloques `dl` dentro de una sección de detalle —
// mismo patrón usado hoy en varias páginas, sin la caja `Card` alrededor.
export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border pb-3">
      <dt className="shrink-0 text-sm text-muted-darker">{label}</dt>
      <dd className="max-w-[60%] truncate text-right text-sm">{value}</dd>
    </div>
  );
}
