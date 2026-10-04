"use client";

import React from "react";
import { ChevronUp, ChevronDown, MoreVertical } from "lucide-react";
import { cn } from "./cn";
import { SkeletonRow } from "./skeleton";
import { EmptyState } from "./empty-state";
import { ListErrorState } from "./list-error-state";
import { Dropdown } from "./dropdown";

export interface TableColumn<T> {
  key: string;
  header: React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  hideBelow?: "sm" | "md";
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
  emptyIcon: React.ElementType;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  /** Nombre de la fila para el botón de acciones ("Acciones de {nombre}"). */
  rowLabel?: (row: T) => string | undefined;
  /** Nombre accesible de la tabla (caption oculto + etiqueta de la región). */
  caption?: string;
  sort?: TableSort;
  onSortChange?: (key: string) => void;
  mobileCard?: (row: T) => React.ReactNode;
  skeletonRows?: number;
  className?: string;
}

const HIDE_BELOW_CLASS: Record<"sm" | "md", string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
};

// Enter/Espacio activan la fila solo si el foco está en la fila misma: un
// botón, enlace o campo anidado conserva su propio comportamiento.
function rowKeyActivate(e: React.KeyboardEvent<HTMLElement>, activate: () => void) {
  if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  activate();
}

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
  rowActions,
  rowLabel,
  caption,
  sort,
  onSortChange,
  mobileCard,
  skeletonRows = 5,
  className,
}: TableProps<T>) {
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
      <div className="-mx-5 hidden overflow-x-auto sm:block" role="region" aria-label={caption ?? "Tabla desplazable horizontalmente"} tabIndex={0}>
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-y border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable && onSortChange
                    ? sort?.key === col.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"
                    : undefined}
                  className={cn(
                    "px-4 py-2.5 text-left text-xs font-medium text-muted-darker uppercase tracking-wider first:pl-5",
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
                </th>
              ))}
              {rowActions && (
                <th scope="col" className="px-4 py-2.5 text-right text-xs font-medium text-muted-darker uppercase tracking-wider w-12"><span className="sr-only">Acciones</span></th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                // Sin role=button: en una <tr> rompería la semántica de tabla; solo
                // se vuelve enfocable y activable con Enter/Espacio.
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => rowKeyActivate(e, () => onRowClick(row)) : undefined}
                className={cn(
                  "hover:bg-surface-light/40 transition-colors",
                  onRowClick && "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-strong"
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4 py-3 first:pl-5",
                      col.hideBelow && HIDE_BELOW_CLASS[col.hideBelow],
                      col.cellClassName
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Dropdown
                      align="right"
                      trigger={
                        <button type="button" aria-label={rowLabel?.(row) ? `Acciones de ${rowLabel(row)}` : "Acciones"} className="p-1.5 rounded-md hover:bg-surface-light text-muted-darker hover:text-foreground transition-colors">
                          <MoreVertical size={14} aria-hidden="true" />
                        </button>
                      }
                    >
                      {rowActions(row)}
                    </Dropdown>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sm:hidden divide-y divide-border -mx-5">
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            className={cn(
              "px-5 py-4 flex items-start justify-between gap-3 hover:bg-surface-light/20 transition-colors",
              onRowClick && "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-strong"
            )}
            tabIndex={onRowClick ? 0 : undefined}
            role={onRowClick ? "button" : undefined}
            onKeyDown={onRowClick ? (e) => rowKeyActivate(e, () => onRowClick(row)) : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            <div className="min-w-0 flex-1">
              {mobileCard ? mobileCard(row) : <DefaultMobileCard row={row} columns={columns} />}
            </div>
            {rowActions && (
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <Dropdown
                  align="right"
                  trigger={
                    <button type="button" aria-label={rowLabel?.(row) ? `Acciones de ${rowLabel(row)}` : "Acciones"} className="p-1.5 rounded-md border border-border bg-surface hover:bg-surface-light text-muted-darker hover:text-foreground transition-colors">
                      <MoreVertical size={14} aria-hidden="true" />
                    </button>
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

function DefaultMobileCard<T>({ row, columns }: { row: T; columns: TableColumn<T>[] }) {
  const [first, ...rest] = columns;
  return (
    <div className="space-y-1">
      <div className="font-medium text-sm">{first.render(row)}</div>
      {rest.slice(0, 2).map((col) => (
        <div key={col.key} className="text-xs text-muted-darker">
          {col.render(row)}
        </div>
      ))}
    </div>
  );
}
