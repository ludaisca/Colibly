"use client";

import { Modal } from "@/app/components/ui/modal";
import { INBOX_SHORTCUTS } from "@/lib/inbox/shortcuts";

// Ayuda de atajos de la bandeja ("?"). La lista sale del mismo mapa que usa
// el listener (lib/inbox/shortcuts.ts), así nunca se desincroniza.
export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Atajos de teclado" description="Funcionan en la bandeja de chats." size="sm">
      <ul className="divide-y divide-border">
        {INBOX_SHORTCUTS.map((shortcut) => (
          <li key={shortcut.action} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-foreground">{shortcut.label}</span>
            <kbd className="shrink-0 rounded-md border border-border bg-surface-light px-1.5 py-0.5 text-xs font-medium text-muted-darker">
              {shortcut.keys}
            </kbd>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-darker">
        Los atajos con Alt también funcionan mientras escribes. En Mac, Alt es la tecla Opción (⌥).
      </p>
    </Modal>
  );
}
