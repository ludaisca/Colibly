"use client";

import { Inbox } from "lucide-react";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { cn } from "@/app/components/ui/cn";
import type { AccountOption } from "./chat-shared";

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
    <div className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-border bg-surface/40 py-3 lg:flex">
      <RailButton active={selectedAccountId === ""} label="Todas las cuentas" unread={totalUnread} onClick={() => onSelect("")}>
        <span className="flex h-10 w-10 items-center justify-center rounded-bubble bg-surface-light text-muted-darker">
          <Inbox size={18} />
        </span>
      </RailButton>

      <div className="my-1 h-px w-8 bg-border" />

      <div className="scrollbar-thin flex flex-col items-center gap-2 overflow-y-auto">
        {accounts.map((acc) => (
          <RailButton
            key={acc.id}
            active={selectedAccountId === acc.id}
            label={acc.name}
            unread={unreadByAccount[acc.id] ?? 0}
            onClick={() => onSelect(acc.id)}
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
  children,
}: {
  active: boolean;
  label: string;
  unread: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={cn(
        "relative flex rounded-bubble transition-opacity duration-fast ease-brand",
        // ring-offset (no padding en el botón) para que el aro no pegue
        // directo al borde del avatar — a este tamaño, un ring pegado sin
        // separación choca con la esquina asimétrica de rounded-bubble y se
        // ve como si el ícono estuviera "cortado" en esa esquina.
        active
          ? "ring-2 ring-accent ring-offset-2 ring-offset-background"
          : "opacity-80 hover:opacity-100"
      )}
    >
      {children}
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
