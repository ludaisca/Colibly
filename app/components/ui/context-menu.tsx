"use client";

import { useCallback, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ContextMenu as AxContextMenu, type ContextMenuOption } from "@astryxdesign/core/ContextMenu";
import { Kbd } from "@astryxdesign/core/Kbd";
import { Check, type LucideIcon } from "lucide-react";

// Adaptador (rediseño con Astryx): menú de clic derecho (y pulsación larga en
// táctil, hoja inferior en el celular) con la ContextMenu de Astryx. API de
// siempre. Regla: es un ATAJO — todo lo que ofrece debe existir también en un
// botón visible (⋯, cabecera…), porque en el teléfono nadie descubre la
// pulsación larga sola.

export type ContextMenuEntry =
  | {
      type?: "item";
      label: string;
      icon?: LucideIcon;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
      /** Marca de opción activa (p. ej. la prioridad actual). */
      checked?: boolean;
      shortcut?: string;
    }
  | { type: "separator" }
  | { type: "label"; label: string }
  | { type: "submenu"; label: string; icon?: LucideIcon; items: ContextMenuEntry[]; disabled?: boolean };

type ItemOption = Extract<ContextMenuOption, { label: ReactNode }>;

/** Entradas de siempre → opciones de Astryx. Un `label` abre una sección con
 * las opciones que lo siguen hasta el próximo separador o título. */
function toOptions(entries: ContextMenuEntry[]): ContextMenuOption[] {
  const out: ContextMenuOption[] = [];
  let section: { type: "section"; title: string; items: ItemOption[] } | null = null;
  const push = (option: ItemOption) => (section ? section.items.push(option) : out.push(option));
  for (const entry of entries) {
    if (entry.type === "separator") {
      section = null;
      out.push({ type: "divider" });
    } else if (entry.type === "label") {
      section = { type: "section", title: entry.label, items: [] };
      out.push(section as ContextMenuOption);
    } else if (entry.type === "submenu") {
      push({
        label: entry.label,
        icon: entry.icon ? <entry.icon size={15} aria-hidden /> : undefined,
        isDisabled: entry.disabled,
        items: toOptions(entry.items),
      });
    } else {
      const Icon = entry.icon;
      push({
        label: entry.label,
        icon:
          entry.checked !== undefined ? (
            <Check size={15} aria-hidden className={entry.checked ? "text-accent-ink" : "invisible"} />
          ) : Icon ? (
            <Icon size={15} aria-hidden />
          ) : undefined,
        onClick: entry.onSelect,
        isDisabled: entry.disabled,
        variant: entry.danger ? "destructive" : "default",
        endContent: entry.shortcut ? <Kbd keys={entry.shortcut.replace(/\s*\+\s*/g, "+").toLowerCase()} /> : undefined,
      });
    }
  }
  return out;
}

interface ContextMenuProps {
  /** El elemento que recibe el clic derecho. */
  children: ReactElement;
  /** Se evalúa al abrir, para leer el estado más reciente. */
  items: ContextMenuEntry[] | (() => ContextMenuEntry[]);
  disabled?: boolean;
  /** Con texto seleccionado dentro del elemento, deja el menú del navegador
   *  (para no quitarle "Copiar" a quien seleccionó texto de un mensaje). */
  nativeWhenTextSelected?: boolean;
  header?: ReactNode;
  /** P. ej. cargar datos de un submenú (asignables) solo cuando se abre. */
  onOpenChange?: (open: boolean) => void;
}

export function ContextMenu({ children, items, disabled, nativeWhenTextSelected, onOpenChange }: ContextMenuProps) {
  // Volver a dibujar al abrir: `items` como función se lee en ese momento.
  const [, setOpenCount] = useState(0);
  // Tras una pulsación larga, el navegador dispara un click al soltar: sin
  // esto, abrir el menú sobre un chat también abriría el chat.
  const openedAt = useRef(0);
  const entries = typeof items === "function" ? items() : items;

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!nativeWhenTextSelected) return;
      const selection = window.getSelection();
      const target = event.currentTarget as Node;
      // Sin propagar: el menú de Astryx (en el envoltorio) no se entera y
      // queda el del navegador, con "Copiar".
      if (selection && !selection.isCollapsed && selection.anchorNode && target.contains(selection.anchorNode)) {
        event.stopPropagation();
      }
    },
    [nativeWhenTextSelected]
  );
  const handleClickCapture = useCallback(
    (event: React.MouseEvent) => {
      if (Date.now() - openedAt.current < 700) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    []
  );
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openedAt.current = Date.now();
        setOpenCount((n) => n + 1);
      }
      onOpenChange?.(open);
    },
    [onOpenChange]
  );

  return (
    <AxContextMenu
      items={toOptions(entries)}
      isDisabled={disabled}
      label="Acciones"
      menuWidth={224}
      presentation="adaptive"
      onOpenChange={handleOpenChange}
    >
      {/* Sin caja propia: solo escucha el clic derecho y el click que sigue a
          una pulsación larga antes de que lleguen al envoltorio de Astryx. */}
      <span className="contents" onContextMenu={handleContextMenu} onClickCapture={handleClickCapture}>
        {children}
      </span>
    </AxContextMenu>
  );
}
