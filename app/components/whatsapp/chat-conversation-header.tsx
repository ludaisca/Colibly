"use client";

import { useId, useState } from "react";
import { ArrowLeft, Check, Loader2, MoreVertical, Phone, RotateCw, SlidersHorizontal, X } from "lucide-react";
import { CHANNEL_ICONS } from "@/app/components/ui/channel-icons";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { Button } from "@/app/components/ui/button";
import { Dropdown } from "@/app/components/ui/dropdown";
import { Select } from "@/app/components/ui/select";
import { ChatAssigneePicker } from "./chat-assignee-picker";
import { ChatBotMode } from "./chat-bot-mode";
import { ChatTagPicker } from "./chat-tag-picker";
import { LeadScoreBadge } from "./lead-score-badge";
import { ChatCostBadge } from "./chat-cost-badge";
import { AutomationChip } from "./automation-chip";
import { STATUS_BADGE, type Channel, type ChatItem, type ChatStatus } from "./chat-shared";

const CHANNELS: Record<Channel, { label: string }> = {
  WHATSAPP: { label: "WhatsApp" },
  TELEGRAM: { label: "Telegram" },
  MESSENGER: { label: "Messenger" },
  INSTAGRAM: { label: "Instagram" },
  WEBCHAT: { label: "Chat web" },
};

interface Props {
  chat: ChatItem;
  refreshKey: string;
  onCloseChat: () => void;
  onOpenContactDrawer: () => void;
  onStatusChange: (status: ChatStatus) => void | Promise<void>;
  onAssigned: (assignee: { id: string; name: string | null } | null) => void;
}

export function ChatConversationHeader({ chat, refreshKey, onCloseChat, onOpenContactDrawer, onStatusChange, onAssigned }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const detailsId = useId();
  const channel = CHANNELS[chat.channel];
  const ChannelIcon = CHANNEL_ICONS[chat.channel];
  const name = chat.name || chat.remoteJid;
  const resolved = chat.status === "RESOLVED";
  // "Telegram · Telegram" se leía como un error: el segundo valor es el nombre
  // de la cuenta, que suele repetir el canal. Solo se muestra si aporta algo.
  const accountName = chat.account.name.trim();
  const subtitle = accountName.toLowerCase() === channel.label.toLowerCase()
    ? channel.label
    : `${channel.label} · ${accountName}`;
  const canCall = chat.channel === "WHATSAPP" && !chat.isGroup && chat.account.callingEnabled && !chat.account.coexistence;
  const MENU_ITEM = "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-light focus-visible:outline-2 focus-visible:outline-accent-strong disabled:opacity-50";

  async function changeStatus(status: ChatStatus) {
    if (changingStatus) return;
    setChangingStatus(true);
    try { await onStatusChange(status); } finally { setChangingStatus(false); }
  }

  return (
    <header className="shrink-0 border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onCloseChat} aria-label="Volver a la lista de chats" className="shrink-0 rounded-xl p-2 text-muted-darker hover:bg-surface-light focus-visible:outline-2 focus-visible:outline-accent-strong lg:hidden">
          <ArrowLeft size={18} />
        </button>
        <EntityAvatar id={chat.accountId} name={name} size="md" />
        <div className="min-w-0 flex-1">
          {chat.contactId ? (
            <button type="button" onClick={onOpenContactDrawer} title="Ver contacto" className="block max-w-full truncate rounded text-left text-base font-semibold text-foreground hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-strong">{name}</button>
          ) : <p className="truncate text-base font-semibold text-foreground">{name}</p>}
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-darker" title={subtitle}>
            <ChannelIcon size={12} className="shrink-0" />
            <span className="truncate">{subtitle}</span>
            {resolved && <span className="shrink-0 rounded-full bg-success-bg px-1.5 text-[10px] font-medium text-success">Resuelto</span>}
          </p>
        </div>
        <Dropdown
          align="right"
          portal
          trigger={
            <button
              type="button"
              aria-label="Acciones de la conversación"
              title="Acciones"
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-accent-strong ${detailsOpen ? "bg-accent-subtle text-accent-ink" : "text-muted-darker hover:bg-surface-light hover:text-foreground"}`}
            >
              <MoreVertical size={18} />
            </button>
          }
        >
          <div className="w-56 p-1">
            <button type="button" className={MENU_ITEM} onClick={() => setDetailsOpen((open) => !open)}>
              <SlidersHorizontal size={15} /> {detailsOpen ? "Ocultar detalles" : "Detalles"}
            </button>
            {canCall && (
              <button
                type="button"
                className={MENU_ITEM}
                onClick={() => window.dispatchEvent(new CustomEvent("colibly-whatsapp-call", { detail: { chatId: chat.id, name } }))}
              >
                <Phone size={15} /> Llamar
              </button>
            )}
            <button
              type="button"
              className={MENU_ITEM}
              disabled={changingStatus}
              onClick={() => void changeStatus(resolved ? "OPEN" : "RESOLVED")}
            >
              {changingStatus ? <Loader2 size={15} className="animate-spin" /> : resolved ? <RotateCw size={15} /> : <Check size={15} />}
              {resolved ? "Reabrir" : "Resolver"}
            </button>
          </div>
        </Dropdown>
      </div>
      {detailsOpen && (
        <div className="border-t border-border bg-surface-light px-3 py-3 sm:px-4">
          <div id={detailsId} role="region" aria-labelledby={`${detailsId}-title`} className="@container flex max-h-[40dvh] flex-col overflow-hidden rounded-xl border border-accent-muted bg-surface shadow-md">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-accent-subtle/40 px-4 py-2">
              <h2 id={`${detailsId}-title`} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <SlidersHorizontal size={15} className="text-accent-ink" /> Detalles de la conversación
              </h2>
              <button type="button" aria-label="Cerrar detalles de la conversación" onClick={() => setDetailsOpen(false)} className="shrink-0 rounded-xl p-2 text-muted-darker hover:bg-accent-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-strong">
                <X size={16} />
              </button>
            </div>
            <div className="grid min-h-0 grid-cols-1 gap-5 overflow-y-auto p-4 @[460px]:grid-cols-2">
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold text-muted-darker">Asignación</h3>
                <ChatAssigneePicker chatId={chat.id} assignedTo={chat.assignedTo} onAssigned={onAssigned} />
              </section>
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold text-muted-darker">Atención</h3>
                <ChatBotMode chatId={chat.id} refreshKey={refreshKey} />
              </section>
              {chat.channel === "WHATSAPP" && !chat.isGroup && chat.account.callingEnabled && !chat.account.coexistence && (
                <section className="min-w-0 space-y-2">
                  <h3 className="text-xs font-semibold text-muted-darker">Llamada</h3>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Phone}
                    onClick={() => window.dispatchEvent(new CustomEvent("colibly-whatsapp-call", { detail: { chatId: chat.id, name: name } }))}
                  >
                    Llamar
                  </Button>
                </section>
              )}
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold text-muted-darker">Estado de la conversación</h3>
                <Select aria-label="Estado de la conversación" value={chat.status} disabled={changingStatus} onChange={(event) => changeStatus(event.target.value as ChatStatus)}>
                  {(Object.keys(STATUS_BADGE) as ChatStatus[]).map((status) => <option key={status} value={status}>{STATUS_BADGE[status].label}</option>)}
                </Select>
              </section>
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold text-muted-darker">Etiquetas</h3>
                <ChatTagPicker chatId={chat.id} />
              </section>
              {(chat.channel === "WHATSAPP" || chat.channel === "TELEGRAM") && (
                <section className="min-w-0 space-y-2">
                  <h3 className="text-xs font-semibold text-muted-darker">Calificación del lead</h3>
                  <LeadScoreBadge chatId={chat.id} />
                </section>
              )}
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold text-muted-darker">Consumo de IA</h3>
                <ChatCostBadge chatId={chat.id} showEmpty />
              </section>
              <section className="min-w-0 space-y-2 @[460px]:col-span-2">
                <h3 className="text-xs font-semibold text-muted-darker">Automatizaciones</h3>
                <AutomationChip chatId={chat.id} showEmpty />
              </section>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
