"use client";

import { useRef, type ReactElement, type ReactNode } from "react";
import { ContextMenu as Base } from "@base-ui/react/context-menu";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

// Menú de clic derecho (y pulsación larga en táctil) con submenús, sobre
// @base-ui/react/context-menu (patrón "context-menu-nested" de Tesela, sin su
// código). Regla: es un ATAJO — todo lo que ofrece debe existir también en un
// botón visible (⋯, cabecera…), porque en el teléfono no hay clic derecho y
// nadie descubre la pulsación larga sola.

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

const POPUP =
  "min-w-52 max-w-72 origin-[var(--transform-origin)] rounded-lg border border-border bg-surface p-1 text-sm text-foreground shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0";
const ITEM =
  "flex w-full cursor-default select-none items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none data-[highlighted]:bg-surface-light data-[disabled]:opacity-50";

function Entries({ items }: { items: ContextMenuEntry[] }) {
  return (
    <>
      {items.map((entry, index) => {
        if (entry.type === "separator") return <Base.Separator key={index} className="mx-1 my-1 h-px bg-border" />;
        if (entry.type === "label") {
          return <div key={index} className="truncate px-2 pb-1 pt-1.5 text-eyebrow text-muted-darker">{entry.label}</div>;
        }
        if (entry.type === "submenu") {
          const Icon = entry.icon;
          return (
            <Base.SubmenuRoot key={index} disabled={entry.disabled}>
              <Base.SubmenuTrigger className={cn(ITEM, "data-[popup-open]:bg-surface-light")}>
                {Icon ? <Icon size={15} className="shrink-0 text-muted-darker" aria-hidden /> : <span className="w-[15px] shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <ChevronRight size={14} className="shrink-0 text-muted-darker" aria-hidden />
              </Base.SubmenuTrigger>
              <Base.Portal>
                <Base.Positioner className="z-[80] outline-none" sideOffset={-2} alignOffset={-5}>
                  <Base.Popup className={cn(POPUP, "max-h-[min(24rem,var(--available-height))] overflow-y-auto")}>
                    <Entries items={entry.items} />
                  </Base.Popup>
                </Base.Positioner>
              </Base.Portal>
            </Base.SubmenuRoot>
          );
        }
        const Icon = entry.icon;
        return (
          <Base.Item
            key={index}
            disabled={entry.disabled}
            onClick={entry.onSelect}
            className={cn(ITEM, entry.danger && "text-danger data-[highlighted]:bg-danger-bg")}
          >
            {entry.checked !== undefined ? (
              <Check size={15} className={cn("shrink-0 text-accent-ink", !entry.checked && "invisible")} aria-hidden />
            ) : Icon ? (
              <Icon size={15} className={cn("shrink-0", entry.danger ? "text-danger" : "text-muted-darker")} aria-hidden />
            ) : (
              <span className="w-[15px] shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.shortcut && <kbd className="shrink-0 font-sans text-micro text-muted-darker">{entry.shortcut}</kbd>}
          </Base.Item>
        );
      })}
    </>
  );
}

interface ContextMenuProps {
  /** El elemento que recibe el clic derecho (se compone con `render`, sin envoltorio). */
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

export function ContextMenu({ children, items, disabled, nativeWhenTextSelected, header, onOpenChange }: ContextMenuProps) {
  // Tras una pulsación larga, el navegador dispara un click al soltar: sin
  // esto, abrir el menú sobre un chat también abriría el chat.
  const openedAt = useRef(0);
  const resolved = typeof items === "function" ? null : items;

  return (
    <Base.Root
      disabled={disabled}
      onOpenChange={(open) => {
        if (open) openedAt.current = Date.now();
        onOpenChange?.(open);
      }}
    >
      <Base.Trigger
        render={children}
        onContextMenu={(event) => {
          if (!nativeWhenTextSelected) return;
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed && selection.anchorNode && event.currentTarget.contains(selection.anchorNode)) {
            event.preventBaseUIHandler();
          }
        }}
        onClickCapture={(event) => {
          if (Date.now() - openedAt.current < 700) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      />
      <Base.Portal>
        <Base.Positioner className="z-[80] outline-none">
          <Base.Popup className={POPUP}>
            {header}
            <Entries items={resolved ?? (items as () => ContextMenuEntry[])()} />
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
