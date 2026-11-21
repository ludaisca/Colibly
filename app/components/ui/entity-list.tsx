"use client";

import React from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "./cn";
import { SkeletonRow } from "./skeleton";
import { EmptyState } from "./empty-state";
import { ListErrorState } from "./list-error-state";
import { Dropdown } from "./dropdown";
import { List, ListItem } from "@astryxdesign/core/List";
import { Card as AxCard } from "@astryxdesign/core/Card";
import { Button } from "./button";

// Lista densa de entidades (sustituye a TileGrid): mismas props y ciclo
// loading/error/empty, pero filas tipo database (Linear/Notion) en vez de
// tiles — más información por pantalla y lectura vertical. Dibujada con
// List/ListItem de Astryx; las acciones por fila usan el mismo Dropdown.

interface EntityListProps<T> {
  rows: T[];
  rowKey: (row: T) => string;
  renderRow: (row: T) => React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyIcon: React.ElementType;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** La fila navega a esta ruta (admite Ctrl/⌘+clic y clic central). */
  rowHref?: (row: T) => string;
  rowActions?: (row: T) => React.ReactNode;
  skeletonCount?: number;
  className?: string;
  rowClassName?: string;
}

export function EntityList<T>({
  rows,
  rowKey,
  renderRow,
  loading,
  error,
  onRetry,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onRowClick,
  rowHref,
  rowActions,
  skeletonCount = 8,
  className,
  rowClassName,
}: EntityListProps<T>) {
  if (loading) {
    return (
      <div className={cn("divide-y divide-border rounded-lg border border-border bg-surface px-3", className)} role="status" aria-label="Cargando datos">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <SkeletonRow key={i} cols={3} />
        ))}
      </div>
    );
  }

  if (error) {
    return <ListErrorState message={error} onRetry={onRetry} className={className} />;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className={className}
      />
    );
  }

  // List de Astryx dentro de una tarjeta: la fila que navega es un enlace real
  // (Ctrl/⌘+clic y clic central abren otra pestaña) y la que abre algo es un
  // botón; los controles dentro de la fila siguen funcionando aparte.
  return (
    <AxCard padding={0} className={cn("overflow-hidden", className)}>
      <List hasDividers edge="padded">
        {rows.map((row) => (
          <ListItem
            key={rowKey(row)}
            itemKey={rowKey(row)}
            className={rowClassName}
            // El área de etiqueta de ListItem apila en columna: la fila de
            // Colibly (avatar, título, meta, botones) va en una sola línea.
            label={<div className="flex w-full min-w-0 items-center gap-2.5">{renderRow(row)}</div>}
            href={rowHref?.(row)}
            onClick={!rowHref && onRowClick ? () => onRowClick(row) : undefined}
            endContent={
              rowActions ? (
                <Dropdown align="right" trigger={<Button variant="ghost" size="icon" icon={MoreVertical} aria-label="Acciones" />}>
                  {rowActions(row)}
                </Dropdown>
              ) : undefined
            }
          />
        ))}
      </List>
    </AxCard>
  );
}

// Anatomía estándar de una fila: leading (normalmente <EntityAvatar>), bloque
// título/subtítulo, badges y meta a la derecha (cifras/fechas en tabular-nums la
// decide el caller). Puro layout — cada página decide el contenido.
interface EntityRowProps {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
}

export function EntityRow({ leading, title, subtitle, badges, meta }: EntityRowProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          {badges}
        </div>
        {subtitle && <div className="truncate text-xs text-muted-darker">{subtitle}</div>}
      </div>
      {meta && (
        <div className="hidden shrink-0 items-center gap-3 text-right text-xs text-muted sm:flex">
          {meta}
        </div>
      )}
    </div>
  );
}
