"use client";

import { Tooltip } from "@/app/components/ui/tooltip";
import { Inbox } from "lucide-react";
import { CHANNEL_ICONS } from "@/app/components/ui/channel-icons";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { cn } from "@/app/components/ui/cn";
import type { AccountOption, Channel } from "./chat-shared";

// Rail vertical de cuentas WhatsApp — estilo "workspaces" de Slack: un ícono
// por cuenta accesible (propia o compartida vía WAAccountShare), color por
// hueClassFor a través de EntityAvatar (mismo color que sus filas en la
// lista), más un ícono "Todas" al inicio. Reemplaza al <Select> de cuenta que
// antes vivía arriba de la lista de chats — ese <Select> se mantiene solo en
// mobile/tablet (< lg), donde este rail no se renderiza por falta de ancho.
// Si el usuario solo tiene una cuenta, el rail no aporta nada y no se monta.

interface ChatAccountRailProps {
  accounts: AccountOption[];
  selectedAccountId: string;
  onSelect: (id: string) => void;
  unreadByAccount: Record<string, number>;
}

export function ChatAccountRail({ accounts, selectedAccountId, onSelect, unreadByAccount }: ChatAccountRailProps) {
  if (accounts.length <= 1) return null;

  const totalUnread = Object.values(unreadByAccount).reduce((a, b) => a + b, 0);

  return (
    <div className="hidden w-14 min-h-0 shrink-0 flex-col items-center gap-1.5 border-r border-border bg-surface/40 py-2 lg:flex">
      <div className="shrink-0">
        <RailButton active={selectedAccountId === ""} label="Todas las cuentas" unread={totalUnread} onClick={() => onSelect("")}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-light text-muted-darker">
            <Inbox size={17} />
          </span>
        </RailButton>
      </div>

      <div className="my-0.5 h-px w-7 shrink-0 bg-border" />

      {/* flex-1 min-h-0: solo así el div realmente se acota a lo que sobra
          del rail y overflow-y-auto dispara nada más cuando hay más cuentas
          de las que caben — sin esto, el div media exacto a su contenido y
          hover:scale-105 en el avatar alcanzaba a "desbordarlo" por un par
          de px, mostrando un scrollbar fantasma solo al pasar el mouse.
          w-full: sin esto, "items-center" del padre deja que este div se
          encoja al ancho de su contenido (40px, igual al ícono) en vez de
          heredar los 64px del rail — con cero margen a los lados, el aro de
          selección (ring-offset + ring) no tenía dónde pintarse y se
          recortaba contra el propio borde del contenedor. */}
      <div className="scrollbar-none flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto py-1">
        {accounts.map((acc) => (
          <RailButton
            key={acc.id}
            active={selectedAccountId === acc.id}
            label={acc.name}
            unread={unreadByAccount[acc.id] ?? 0}
            onClick={() => onSelect(acc.id)}
            channel={acc.channel}
          >
            <EntityAvatar id={acc.id} name={acc.name} size="md" />
          </RailButton>
        ))}
      </div>
    </div>
  );
}

function RailButton({
  active,
  label,
  unread,
  onClick,
  channel,
  children,
}: {
  active: boolean;
  label: string;
  unread: number;
  onClick: () => void;
  channel?: Channel;
  children: React.ReactNode;
}) {
  const Mark = channel && channel !== "WHATSAPP" ? CHANNEL_ICONS[channel] : null;
  return (
    <Tooltip label={label}><button aria-label={label}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex rounded-lg transition-opacity duration-fast ease-brand",
        // ring-offset (no padding en el botón) para que el aro de selección
        // no pegue directo al borde del avatar y se note como un halo propio.
        active
          ? "ring-2 ring-accent-strong ring-offset-2 ring-offset-background"
          : "opacity-80 hover:opacity-100"
      )}
    >
      {children}
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-micro font-bold text-on-accent">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
      {Mark && (
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-surface ring-2 ring-background">
          <Mark size={11} />
        </span>
      )}
    </button></Tooltip>
  );
}
