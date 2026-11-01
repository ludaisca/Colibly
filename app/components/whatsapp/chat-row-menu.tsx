"use client";

import { useState, type ReactElement } from "react";
import { Check, Clock, Contact, Copy, Flag, MessageSquare, RotateCw, UserCheck, UserMinus, Users } from "lucide-react";
import { ContextMenu, type ContextMenuEntry } from "@/app/components/ui/context-menu";
import { displayName } from "@/lib/chats/display-name";
import { PRIORITY_OPTIONS, snoozeUntilFor, type ChatItem, type ChatRowAction } from "./chat-shared";

type Assignee = { id: string; name: string | null; email?: string | null };

// Clic derecho (o pulsación larga) sobre una fila de la lista de chats: las
// acciones de la cabecera del chat sin tener que abrirlo. Es un atajo — todo
// sigue en el menú ⋯ y en la ficha de cada conversación.
export function ChatRowMenu({ chat, currentUserId, onAction, disabled, children }: {
  chat: ChatItem;
  currentUserId?: string | null;
  onAction: (chat: ChatItem, action: ChatRowAction) => void;
  disabled?: boolean;
  children: ReactElement;
}) {
  const [assignees, setAssignees] = useState<Assignee[] | null>(null);
  const run = (action: ChatRowAction) => onAction(chat, action);
  const resolved = chat.status === "RESOLVED";
  // Si ya venció, "Quitar posposición" solo limpia el campo: inofensivo.
  const snoozed = !!chat.snoozedUntil;

  function loadAssignees(open: boolean) {
    if (!open || assignees) return;
    fetch(`/api/whatsapp/chats/${chat.id}/assignees`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAssignees(Array.isArray(data) ? data : []))
      .catch(() => setAssignees([]));
  }

  const assignItems: ContextMenuEntry[] = assignees === null
    ? [{ label: "Cargando…", disabled: true, onSelect: () => {} }]
    : assignees.length === 0
      ? [{ label: "Nadie más puede atenderlo", disabled: true, onSelect: () => {} }]
      : assignees.map((a) => ({
          label: a.name ?? a.email ?? "Sin nombre",
          checked: chat.assignedToId === a.id,
          onSelect: () => run({ type: "assign", userId: a.id }),
        }));

  const items: ContextMenuEntry[] = [
    { type: "label", label: displayName(chat.name, chat.remoteJid) },
    { label: "Abrir chat", icon: MessageSquare, onSelect: () => run({ type: "open" }) },
    ...(chat.contactId ? [{ label: "Ver contacto", icon: Contact, onSelect: () => run({ type: "contact" }) }] : []),
    { type: "separator" },
    ...(chat.assignedToId !== currentUserId ? [{ label: "Asignarme", icon: UserCheck, onSelect: () => run({ type: "assign", userId: "me" }) }] : []),
    {
      type: "submenu",
      label: "Asignar a",
      icon: Users,
      items: [
        ...assignItems,
        ...(chat.assignedToId ? [{ type: "separator" } as const, { label: "Quitar asignación", icon: UserMinus, onSelect: () => run({ type: "assign", userId: null }) }] : []),
      ],
    },
    {
      type: "submenu",
      label: "Prioridad",
      icon: Flag,
      items: PRIORITY_OPTIONS.map((option) => ({
        label: option.label,
        checked: chat.priority === option.value,
        onSelect: () => run({ type: "priority", priority: option.value }),
      })),
    },
    {
      type: "submenu",
      label: "Posponer",
      icon: Clock,
      items: [
        { label: "1 hora", onSelect: () => run({ type: "snooze", until: snoozeUntilFor("1h") }) },
        { label: "Mañana a las 9:00", onSelect: () => run({ type: "snooze", until: snoozeUntilFor("tomorrow") }) },
        { label: "En una semana", onSelect: () => run({ type: "snooze", until: snoozeUntilFor("week") }) },
        ...(snoozed ? [{ type: "separator" } as const, { label: "Quitar posposición", onSelect: () => run({ type: "snooze", until: null }) }] : []),
      ],
    },
    { type: "separator" },
    resolved
      ? { label: "Reabrir", icon: RotateCw, onSelect: () => run({ type: "status", status: "OPEN" }) }
      : { label: "Resolver", icon: Check, onSelect: () => run({ type: "status", status: "RESOLVED" }) },
    { label: "Copiar enlace", icon: Copy, onSelect: () => run({ type: "copy-link" }) },
  ];

  return (
    <ContextMenu items={items} disabled={disabled} onOpenChange={loadAssignees}>
      {children}
    </ContextMenu>
  );
}
