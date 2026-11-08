"use client";

import { useRouter } from "next/navigation";
import type React from "react";

// Filas clicables de `Table` y `EntityList` (auditoría WDG, 2026-11-07). Antes
// eran un `onClick` en la fila: con teclado no se podían abrir y las que
// navegan no admitían Ctrl/⌘+clic ni el clic central. Ahora:
//
// - la fila entra en el orden de tabulación y se abre con Enter o Espacio;
// - con `rowHref` se comporta como un enlace: clic → navegar; Ctrl/⌘/Mayús+clic
//   o clic central → pestaña nueva;
// - un clic que nace en un control de la fila (botón, enlace, casilla) o en un
//   menú dibujado en un portal (los eventos de React cruzan portales) no abre
//   la fila, así que el `stopPropagation` de cada celda deja de ser necesario.
//
// La fila no lleva `role="button"`/`"link"`: contiene otros controles (menú de
// acciones) y un control dentro de otro es inválido. El lector de pantalla
// anuncia el contenido de la fila al enfocarla.

const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="menuitem"],[role="checkbox"],[role="switch"],[role="option"],[contenteditable="true"]';

function fromInsideControl(event: React.SyntheticEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  if (!event.currentTarget.contains(target)) return true; // portal
  const control = target.closest(INTERACTIVE);
  return !!control && control !== event.currentTarget && event.currentTarget.contains(control);
}

function openInNewTab(href: string) {
  window.open(href, "_blank", "noopener");
}

export function useRowActivation<T>(onRowClick?: (row: T) => void, rowHref?: (row: T) => string) {
  const router = useRouter();
  if (!onRowClick && !rowHref) return null;

  return (row: T) => {
    const href = rowHref?.(row);
    const activate = (newTab: boolean) => {
      if (href) {
        if (newTab) openInNewTab(href);
        else router.push(href);
      } else {
        onRowClick?.(row);
      }
    };
    return {
      tabIndex: 0,
      // globals.css: el anillo de foco va por dentro (las listas recortan con overflow-hidden).
      "data-row": "",
      "data-row-link": href ? "" : undefined,
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (fromInsideControl(event)) return;
        activate(!!href && (event.metaKey || event.ctrlKey || event.shiftKey));
      },
      onAuxClick: (event: React.MouseEvent<HTMLElement>) => {
        if (event.button !== 1 || !href || fromInsideControl(event)) return;
        event.preventDefault();
        openInNewTab(href);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activate(!!href && (event.metaKey || event.ctrlKey));
      },
    };
  };
}
