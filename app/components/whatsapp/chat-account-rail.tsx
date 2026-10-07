"use client";

import { Inbox } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/app/components/kit/tooltip";
import { cn } from "@/app/components/kit/utils";
import { ContactAvatar } from "@/app/components/crm/contact-avatar";
import { ChannelGlyph } from "./channel-meta";
import type { AccountOption, Channel } from "./chat-shared";

// Rail vertical de cuentas (estilo "workspaces"): un botón por cuenta accesible
// (propia o compartida), con el mismo color que sus filas, más "Todas" al
// inicio. Solo se monta con 2+ cuentas y a partir de `lg`; debajo, la lista
// trae sus propios chips de cuenta.

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
    <nav aria-label="Cuentas" className="hidden w-16 min-h-0 shrink-0 flex-col items-center gap-2 border-r bg-surface py-3 lg:flex">
      <RailButton active={selectedAccountId === ""} label="Todas las cuentas" unread={totalUnread} onClick={() => onSelect("")}>
        <span className="flex size-10 items-center justify-center rounded-full bg-surface-light text-muted-foreground">
          <Inbox size={18} />
        </span>
      </RailButton>

      <div className="my-1 h-px w-8 shrink-0 bg-border" />

      <div className="scrollbar-thin flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto py-1">
        {accounts.map((acc) => (
          <RailButton key={acc.id} active={selectedAccountId === acc.id} label={acc.name} unread={unreadByAccount[acc.id] ?? 0} onClick={() => onSelect(acc.id)} channel={acc.channel}>
            <ContactAvatar id={acc.id} name={acc.name} size="md" />
          </RailButton>
        ))}
      </div>
    </nav>
  );
}

function RailButton({ active, label, unread, onClick, channel, children }: { active: boolean; label: string; unread: number; onClick: () => void; channel?: Channel; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "relative flex rounded-full outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring",
              active ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : "opacity-75 hover:opacity-100"
            )}
          />
        }
      >
        {children}
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground ring-2 ring-surface">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
        {/* WhatsApp es el canal mayoritario y no necesita distinguirse a sí
            mismo — los demás llevan su marca. */}
        {channel && channel !== "WHATSAPP" && (
          <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-card text-foreground ring-2 ring-surface">
            <ChannelGlyph channel={channel} size={9} />
          </span>
        )}
      </TooltipTrigger>
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}
