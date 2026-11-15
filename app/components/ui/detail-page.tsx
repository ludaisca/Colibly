"use client";

import React from "react";
import { cn } from "./cn";
import { Tabs } from "./tabs";
import { BackLink } from "./back-link";

// Plantilla compartida de página de detalle (cuentas/[id], bots/[id], etc.):
// back-link + título (+ badge) + tabs opcionales + contenido. Sustituye al
// patrón repetido de header manual. Cada caller agrupa el contenido según su
// función: superficies para bloques de ajustes, listas para datos densos.

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
  maxWidth = "max-w-6xl",
  children,
  className,
}: DetailPageProps) {
  return (
    <div className={cn("mx-auto space-y-6", maxWidth, className)}>
      <div>
        <BackLink href={backHref} className="mb-3">{backLabel}</BackLink>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h1 className="min-w-0 break-words text-page-title">{title}</h1>
              {badge}
            </div>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex max-w-full flex-wrap gap-2">{actions}</div>}
        </div>
      </div>

      {tabs?.length ? <Tabs items={tabs} value={activeTab ?? tabs[0].id} onChange={(id) => onTabChange?.(id)} label={`Secciones de ${title}`}>
        {children}
      </Tabs> : children}
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
