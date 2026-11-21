"use client";

import { Pagination as AxPagination } from "@astryxdesign/core/Pagination";

// Adaptador (rediseño con Astryx): Pagination de Astryx con la API de siempre.
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className={className}>
      <AxPagination page={currentPage} totalPages={totalPages} onChange={onPageChange} label="Paginación" />
    </div>
  );
}
