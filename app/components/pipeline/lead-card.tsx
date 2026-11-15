"use client";

import { useDraggable } from "@dnd-kit/core";
import { MoreHorizontal, Contact, Copy } from "lucide-react";
import { formatPhoneShort } from "@/lib/format/phone";
import { displayName as chatDisplayName } from "@/lib/chats/display-name";
import { ContextMenu, type ContextMenuEntry } from "@/app/components/ui/context-menu";
import { Dropdown, DropdownDivider, DropdownItem, DropdownLabel } from "@/app/components/ui/dropdown";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { cn } from "@/app/components/ui/cn";
import { useHueClass } from "@/app/components/ui/account-hues";
import { useMinuteNow } from "@/app/components/ui/relative-time";
import type { LeadStatus } from "@prisma/client";
import { formatMxn } from "@/lib/money";
import { stallSignal } from "@/lib/pipeline/card-signal";

export interface LeadCardData {
  id: string;
  name: string | null;
  remoteJid: string;
  leadStatus: LeadStatus;
  stageId: string;
  accountId: string | null;
  /** Dato de ejemplo (Spa Aurora). */
  isSample?: boolean;
  /** Cuenta (WhatsApp o canal) para la línea de color de la tarjeta. */
  lineAccountId?: string | null;
  channel: "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";
  tags: { tag: { id: string; name: string; color: string } }[];
  bestScore: { score: number; label: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  /** Valor del trato en centavos (lib/money.ts). */
  dealValueCents: number | null;
  /** Fecha estimada de cierre (ISO). */
  expectedCloseAt: string | null;
  /** Desde cuándo está en la etapa (ISO; lo mantiene un trigger de la base). */
  stageEnteredAt?: string | null;
  /** Ejecutivo asignado al chat del contacto. */
  assignee: { id: string; name: string | null } | null;
  /** La etapa es ganada/perdida: una fecha de cierre pasada ya no es atraso. */
  closed?: boolean;
}

export type StageOption = { id: string; name: string };

const CHANNEL_LABEL: Record<LeadCardData["channel"], string> = {
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  WEBCHAT: "Chat web",
};

const SIGNAL_CLASS = {
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-muted-darker",
} as const;

// Tarjeta del embudo (dirección congelada, nov 2026): blanca, radio 8, tres
// datos — nombre con avatar, monto y canal, y una señal (sin movimiento desde
// 3 días en ámbar, desde 6 en rojo; si no, el siguiente paso en gris). Toda
// la tarjeta se arrastra y un clic abre la ficha; la etapa también se cambia
// desde el menú ⋯ (misma acción que el arrastre). Sombra solo al arrastrar.
export function LeadCard({ data, stages, onOpen, onStageChange, overlay = false }: {
  data: LeadCardData;
  stages?: StageOption[];
  onOpen?: (id: string) => void;
  onStageChange?: (id: string, stageId: string) => void;
  /** Copia que sigue al puntero durante el arrastre (DragOverlay). */
  overlay?: boolean;
}) {
  const hueClassFor = useHueClass();
  const displayName = chatDisplayName(data.name, data.remoteJid);
  const now = useMinuteNow();
  const phoneShort = data.channel === "WHATSAPP" ? formatPhoneShort(data.remoteJid) : null;
  const signal = stallSignal(data, now);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: data.id,
    data: { stageId: data.stageId },
    disabled: overlay,
  });

  const canMove = !!onStageChange && !!stages && stages.length > 0;
  const menuItems: ContextMenuEntry[] = [
    { type: "label", label: displayName },
    ...(onOpen ? [{ label: "Ver contacto", icon: Contact, onSelect: () => onOpen(data.id) }] : []),
    ...(canMove
      ? [{
          type: "submenu" as const,
          label: "Mover a etapa",
          items: stages!.map((stage) => ({
            label: stage.name,
            checked: stage.id === data.stageId,
            onSelect: () => { if (stage.id !== data.stageId) onStageChange!(data.id, stage.id); },
          })),
        }]
      : []),
    ...(phoneShort
      ? [{ type: "separator" as const }, { label: "Copiar número", icon: Copy, onSelect: () => void navigator.clipboard.writeText(data.remoteJid.replace(/@.*$/, "")).catch(() => {}) }]
      : []),
  ];

  const card = (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      // El arrastre arranca tras 5 px con el mouse o tras una pulsación de
      // 200 ms en pantallas táctiles; un clic sin mover abre la ficha. Con
      // teclado: Enter abre la ficha, Espacio levanta la tarjeta.
      onClick={onOpen ? () => onOpen(data.id) : undefined}
      onKeyDown={overlay ? undefined : (event) => {
        if (event.key === "Enter" && onOpen && event.target === event.currentTarget) {
          event.preventDefault();
          onOpen(data.id);
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
      aria-label={`${displayName}${onOpen ? ". Enter abre la ficha; Espacio la levanta para cambiar de etapa" : ""}`}
      className={cn(
        "group relative cursor-grab touch-manipulation select-none overflow-hidden rounded-md border border-border bg-surface py-2.5 pl-4 pr-2 text-left active:cursor-grabbing",
        data.lineAccountId && hueClassFor(data.lineAccountId),
        isDragging && !overlay && "opacity-40",
        overlay && "shadow-md"
      )}
    >
      {data.lineAccountId && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-entity" />}
      <div className="flex items-center gap-2">
        <EntityAvatar id={data.lineAccountId ?? data.id} name={displayName} size="xs" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{displayName}</p>
        {data.unreadCount > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Mensajes sin leer" />}
        {canMove && !overlay && (
          <span onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <Dropdown
              align="right"
              portal
              trigger={
                <button type="button" aria-label={`Opciones de ${displayName}`} className="grid h-6 w-6 place-items-center rounded-sm text-muted hover:bg-surface-light hover:text-foreground">
                  <MoreHorizontal size={16} aria-hidden />
                </button>
              }
            >
              {onOpen && <DropdownItem icon={Contact} onClick={() => onOpen(data.id)}>Ver contacto</DropdownItem>}
              <DropdownDivider />
              <DropdownLabel>Mover a etapa</DropdownLabel>
              {stages!.filter((stage) => stage.id !== data.stageId).map((stage) => (
                <DropdownItem key={stage.id} onClick={() => onStageChange!(data.id, stage.id)}>{stage.name}</DropdownItem>
              ))}
            </Dropdown>
          </span>
        )}
      </div>
      <p className="mt-1.5 flex items-baseline gap-1.5 text-xs text-muted">
        {data.dealValueCents !== null && (
          <span className="font-display text-base font-semibold leading-none tabular-nums text-foreground">{formatMxn(data.dealValueCents)}</span>
        )}
        <span className="min-w-0 truncate">
          {data.dealValueCents !== null && "· "}
          {phoneShort ?? CHANNEL_LABEL[data.channel]}
        </span>
        {data.isSample && <span className="ml-auto shrink-0 rounded-xs bg-info-bg px-1 text-xs text-info">Ejemplo</span>}
      </p>
      {signal && <p className={cn("mt-1 text-xs", SIGNAL_CLASS[signal.tone])}>{signal.label}</p>}
    </div>
  );

  if (overlay) return card;
  return (
    <ContextMenu items={menuItems} disabled={!onOpen && !onStageChange}>
      {card}
    </ContextMenu>
  );
}
