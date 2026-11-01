// Atajos de teclado de la bandeja (Chatwoot usa Alt+J/K/E…). Puro: el mapa y
// las reglas se prueban sin DOM; chat-workspace.tsx solo conecta el listener.
//
// Se compara `event.code` (KeyJ…) y no `event.key`: en macOS Alt+J escribe "∆".

export type InboxShortcutAction =
  | "next-chat"
  | "prev-chat"
  | "resolve"
  | "assign-me"
  | "snooze-1h"
  | "focus-search"
  | "help";

export interface InboxShortcut {
  action: InboxShortcutAction;
  /** Texto para la ayuda y el palette. */
  keys: string;
  label: string;
  code: string;
  alt: boolean;
  shift?: boolean;
}

export const INBOX_SHORTCUTS: InboxShortcut[] = [
  { action: "next-chat", keys: "Alt + J", label: "Siguiente chat", code: "KeyJ", alt: true },
  { action: "prev-chat", keys: "Alt + K", label: "Chat anterior", code: "KeyK", alt: true },
  { action: "resolve", keys: "Alt + E", label: "Resolver el chat abierto", code: "KeyE", alt: true },
  { action: "assign-me", keys: "Alt + A", label: "Asignarme el chat abierto", code: "KeyA", alt: true },
  { action: "snooze-1h", keys: "Alt + S", label: "Posponer el chat 1 hora", code: "KeyS", alt: true },
  { action: "focus-search", keys: "/", label: "Buscar chat", code: "Slash", alt: false },
  { action: "help", keys: "?", label: "Ver los atajos", code: "Slash", alt: false, shift: true },
];

export interface KeyLike {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** La acción que corresponde a la tecla, o null. Ctrl/Cmd nunca: son del navegador. */
export function matchInboxShortcut(event: KeyLike): InboxShortcutAction | null {
  if (event.ctrlKey || event.metaKey) return null;
  for (const shortcut of INBOX_SHORTCUTS) {
    if (shortcut.code !== event.code || shortcut.alt !== event.altKey) continue;
    if (Boolean(shortcut.shift) !== event.shiftKey) continue;
    return shortcut.action;
  }
  return null;
}

export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  role?: string | null;
}

/** ¿El foco está escribiendo? Entonces los atajos sin Alt no aplican. */
export function isTypingTarget(target: TargetLike | null): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(target.isContentEditable) || target.role === "textbox";
}

/**
 * ¿Se dispara este atajo? Los de Alt funcionan incluso escribiendo (como en
 * Chatwoot) salvo que haya un diálogo abierto; "/" y "?" solo fuera de campos.
 */
export function shouldHandleShortcut(action: InboxShortcutAction, opts: { typing: boolean; dialogOpen: boolean }): boolean {
  if (opts.dialogOpen) return false;
  const shortcut = INBOX_SHORTCUTS.find((s) => s.action === action);
  if (!shortcut) return false;
  return shortcut.alt || !opts.typing;
}

/** Índice del chat siguiente/anterior en la lista visible (sin dar la vuelta). */
export function adjacentIndex(ids: string[], currentId: string | null, direction: 1 | -1): number | null {
  if (ids.length === 0) return null;
  const current = currentId ? ids.indexOf(currentId) : -1;
  if (current === -1) return direction === 1 ? 0 : ids.length - 1;
  const next = current + direction;
  return next < 0 || next >= ids.length ? null : next;
}
