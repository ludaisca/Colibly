"use client";

import React from "react";
import { ChevronUp, ChevronDown, MoreVertical } from "lucide-react";
import {
  Table as AxTable,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@astryxdesign/core/Table";
import { Button } from "./button";
import { cn } from "./cn";
import { SkeletonRow } from "./skeleton";
import { EmptyState } from "./empty-state";
import { ListErrorState } from "./list-error-state";
import { Dropdown } from "./dropdown";
import { useRowActivation } from "./row-activation";

export interface TableColumn<T> {
  key: string;
  header: React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  hideBelow?: "sm" | "md" | "lg";
}

interface TableSort {
  key: string;
  direction: "asc" | "desc";
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyIcon?: React.ElementType;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** La fila navega a esta ruta (admite Ctrl/⌘+clic y clic central). */
  rowHref?: (row: T) => string;
  rowActions?: (row: T) => React.ReactNode;
  sort?: TableSort;
  onSortChange?: (key: string) => void;
  mobileCard?: (row: T) => React.ReactNode;
  skeletonRows?: number;
  className?: string;
}

const HIDE_BELOW_CLASS: Record<"sm" | "md" | "lg", string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

export function Table<T>({
  columns,
  rows,
  rowKey,
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
  sort,
  onSortChange,
  mobileCard,
  skeletonRows = 5,
  className,
}: TableProps<T>) {
  const activation = useRowActivation(onRowClick, rowHref);
  if (loading) {
    return (
      <div className={cn("divide-y divide-border", className)} role="status" aria-label="Cargando datos">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <SkeletonRow key={i} cols={columns.length} />
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

  return (
    <div className={className}>
      <div className="-mx-4 hidden overflow-x-auto sm:block" role="region" aria-label="Tabla desplazable horizontalmente" tabIndex={0}>
        <AxTable density="compact" hasHover>
          <TableHeader>
            {/* Encabezado en surface-light, text-xs 500 sin mayúsculas; filas de 40 px. */}
            <TableRow>
              {columns.map((col) => (
                <TableHeaderCell
                  key={col.key}
                  aria-sort={col.sortable && onSortChange
                    ? sort?.key === col.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"
                    : undefined}
                  className={cn(
                    "text-left",
                    col.hideBelow && HIDE_BELOW_CLASS[col.hideBelow],
                    col.headerClassName
                  )}
                >
                  {col.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(col.key)}
                      className="inline-flex items-center gap-1 rounded-sm text-left hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
                    >
                      {col.header}
                      {sort?.key === col.key && (sort.direction === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </button>
                  ) : <span className="inline-flex items-center gap-1">{col.header}</span>}
                </TableHeaderCell>
              ))}
              {rowActions && (
                <TableHeaderCell className="w-12 text-right"><span className="sr-only">Acciones</span></TableHeaderCell>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={cn(activation && "cursor-pointer")}
                {...activation?.(row)}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      "tabular-nums",
                      col.hideBelow && HIDE_BELOW_CLASS[col.hideBelow],
                      col.cellClassName
                    )}
                  >
                    {col.render(row)}
                  </TableCell>
                ))}
                {rowActions && (
                  <TableCell className="text-right">
                    <Dropdown
                      align="right"
                      // El contenedor es overflow-x-auto (fuerza también overflow-y):
                      // un menú "absolute" se recortaría o abriría scroll.
                      portal
                      trigger={
                        <Button variant="ghost" size="icon" icon={MoreVertical} aria-label="Acciones" />
                      }
                    >
                      {rowActions(row)}
                    </Dropdown>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </AxTable>
      </div>

      <div className="sm:hidden divide-y divide-border -mx-4">
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            className={cn(
              "px-4 py-3 flex items-start justify-between gap-3 hover:bg-surface-light transition-colors duration-fast",
              activation && "cursor-pointer"
            )}
            {...activation?.(row)}
          >
            <div className="min-w-0 flex-1">
              {mobileCard ? mobileCard(row) : <DefaultMobileCard row={row} columns={columns} />}
            </div>
            {rowActions && (
              <div className="shrink-0">
                <Dropdown
                  align="right"
                  portal
                  trigger={
                    <Button variant="ghost" size="icon" icon={MoreVertical} aria-label="Acciones" />
                  }
                >
                  {rowActions(row)}
                </Dropdown>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Tarjeta del teléfono: la primera columna como título y hasta 4 más como
// pares «encabezado: valor». Antes salían los valores sueltos ("1", "0") sin
// decir qué eran (revisión de pantallas 2026-11-07).
function DefaultMobileCard<T>({ row, columns }: { row: T; columns: TableColumn<T>[] }) {
  const [first, ...rest] = columns;
  return (
    <div className="space-y-1.5">
      <div className="font-medium text-sm">{first.render(row)}</div>
      {rest.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {rest.slice(0, 4).map((col) => (
            <div key={col.key} className="flex min-w-0 items-baseline gap-1.5">
              <dt className="shrink-0 text-muted-darker">{col.header}:</dt>
              <dd className="min-w-0 truncate tabular-nums text-foreground">{col.render(row)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
