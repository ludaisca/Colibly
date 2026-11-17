"use client";

import { Tooltip } from "@/app/components/ui/tooltip";
import { displayName } from "@/lib/chats/display-name";
import { useId, useState } from "react";
import { ArrowLeft, Check, MoreHorizontal, PanelRight, Phone, RotateCw, SlidersHorizontal, Trophy, X, Zap } from "lucide-react";
import { ChannelAvatar } from "@/app/components/ui/channel-avatar";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { useToast } from "@/app/components/ui/toast";
import { formatPhoneShort } from "@/lib/format/phone";
import { Dropdown, DropdownItem } from "@/app/components/ui/dropdown";
import { Select } from "@/app/components/ui/select";
import { ChatAssigneePicker } from "./chat-assignee-picker";
import { ChatTeamPicker } from "./chat-team-picker";
import { ChatBotMode } from "./chat-bot-mode";
import { ChatTagPicker } from "./chat-tag-picker";
import { ChatPriorityPicker } from "./chat-priority-picker";
import { ChatSnoozeControls } from "./chat-snooze-controls";
import { ChatCustomFields } from "./chat-custom-fields";
import { MacroPickerModal } from "./macro-picker-modal";
import { LeadScoreBadge } from "./lead-score-badge";
import { ChatCostBadge } from "./chat-cost-badge";
import { AutomationChip } from "./automation-chip";
import { STATUS_BADGE, type Channel, type ChatItem, type ChatPriority, type ChatStatus } from "./chat-shared";

const CHANNELS: Record<Channel, { label: string }> = {
  WHATSAPP: { label: "WhatsApp" },
  TELEGRAM: { label: "Telegram" },
  MESSENGER: { label: "Messenger" },
  INSTAGRAM: { label: "Instagram" },
  WEBCHAT: { label: "Chat web" },
  WHATSAPP_WEB: { label: "WhatsApp (QR)" },
};

interface Props {
  chat: ChatItem;
  refreshKey: string;
  typingUsers: Array<{ id: string; name: string | null }>;
  onCloseChat: () => void;
  onOpenContactDrawer: () => void;
  onStatusChange: (status: ChatStatus) => void | Promise<void>;
  onAssigned: (assignee: { id: string; name: string | null } | null) => void;
  onPriorityChange: (priority: ChatPriority) => void;
  onSnoozedChange: (until: string | null) => void;
  onMacroApplied?: () => void;
  /** Ficha derecha (xl): abierta o no, y cómo alternarla. */
  contactPanelOpen?: boolean;
  onToggleContactPanel?: () => void;
  /** El contacto cambió (p. ej. "Marcar venta"): refrescar lista y ficha. */
  onContactChanged?: () => void;
}

export function ChatConversationHeader({ chat, refreshKey, typingUsers, onCloseChat, onOpenContactDrawer, onStatusChange, onAssigned, onPriorityChange, onSnoozedChange, onMacroApplied, contactPanelOpen, onToggleContactPanel, onContactChanged }: Props) {
  const { error: toastError, success } = useToast();
  const [markingSale, setMarkingSale] = useState(false);
  const [leadStatus, setLeadStatus] = useState(chat.leadStatus ?? null);
  const phone = chat.channel === "WHATSAPP" && !chat.isGroup ? formatPhoneShort(chat.remoteJid) : null;

  // "Marcar venta": el contacto pasa a Cliente (misma acción que la ficha y el
  // embudo; afterLeadStatusChanged registra la venta ganada).
  async function markSale() {
    if (!chat.contactId || markingSale) return;
    setMarkingSale(true);
    try {
      const res = await fetch(`/api/whatsapp/contacts/${chat.contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadStatus: "CUSTOMER" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo marcar la venta");
      setLeadStatus("CUSTOMER");
      success("Venta ganada");
      onContactChanged?.();
    } catch (error) {
      toastError(error instanceof Error ? error.message : "No se pudo marcar la venta");
    } finally {
      setMarkingSale(false);
    }
  }
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [macroOpen, setMacroOpen] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const detailsId = useId();
  const channel = CHANNELS[chat.channel];
  const name = displayName(chat.name, chat.remoteJid);
  const resolved = chat.status === "RESOLVED";
  // "Telegram · Telegram" se leía como un error: el segundo valor es el nombre
  // de la cuenta, que suele repetir el canal. Solo se muestra si aporta algo.
  const accountName = chat.account.name.trim();
  const subtitle = accountName.toLowerCase() === channel.label.toLowerCase()
    ? channel.label
    : `${channel.label} · ${accountName}`;
  const canCall = chat.channel === "WHATSAPP" && !chat.isGroup && chat.account.callingEnabled && !chat.account.coexistence;
  const typingLabel = typingUsers.length === 0
    ? null
    : typingUsers.length === 1
      ? `${typingUsers[0]?.name ?? "Alguien"} está escribiendo…`
      : typingUsers.length === 2
        ? `${typingUsers[0]?.name ?? "Alguien"} y ${typingUsers[1]?.name ?? "otra persona"} están escribiendo…`
        : `${typingUsers[0]?.name ?? "Alguien"} y ${typingUsers.length - 1} más están escribiendo…`;

  async function changeStatus(status: ChatStatus) {
    if (changingStatus) return;
    setChangingStatus(true);
    try { await onStatusChange(status); } finally { setChangingStatus(false); }
  }

  return (
    <header className="shrink-0 border-b border-border bg-surface">
      {/* 56 px: avatar, nombre y número, Asignado a, Marcar venta y menú ⋯. */}
      <div className="flex h-14 items-center gap-2.5 px-3">
        <Button type="button" variant="ghost" size="icon" icon={ArrowLeft} onClick={onCloseChat} aria-label="Volver a la lista de chats" className="lg:hidden" />
        <ChannelAvatar id={chat.accountId} name={name} channel={chat.channel} size="sm" />
        <div className="min-w-[7rem] flex-1">
          {chat.contactId ? (
            <Tooltip label="Ver contacto"><button type="button" onClick={onOpenContactDrawer} className="block max-w-full truncate rounded text-left text-title text-foreground hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-strong">{name}</button></Tooltip>
          ) : <p className="truncate text-title text-foreground">{name}</p>}
          {typingLabel ? (
            <p className="truncate text-xs font-medium text-accent-ink motion-safe:animate-pulse">{typingLabel}</p>
          ) : (
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted" title={subtitle}>
              {/* Sin icono de canal: la insignia del avatar ya lo muestra. */}
              {phone ? <span className="shrink-0 tabular-nums">{phone}</span> : <span className="truncate">{subtitle}</span>}
              {phone && <span className="hidden truncate sm:inline">· {subtitle}</span>}
              {resolved && <Badge tone="success" size="sm">Resuelto</Badge>}
            </p>
          )}
        </div>
        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          <span className="hidden text-xs text-muted 2xl:inline">Asignado a</span>
          <ChatAssigneePicker chatId={chat.id} assignedTo={chat.assignedTo} onAssigned={onAssigned} />
        </div>
        {chat.contactId && (leadStatus === "CUSTOMER" ? (
          <Badge tone="success" size="sm" className="hidden sm:inline-flex">Venta ganada</Badge>
        ) : leadStatus === "LOST" ? (
          <Badge tone="neutral" size="sm" className="hidden sm:inline-flex">Perdido</Badge>
        ) : (
          <Button type="button" variant="secondary" size="sm" icon={Trophy} loading={markingSale} onClick={() => void markSale()} className="hidden shrink-0 sm:inline-flex">
            Marcar venta
          </Button>
        ))}
        {onToggleContactPanel && chat.contactId && (
          <Tooltip label={contactPanelOpen ? "Ocultar ficha" : "Mostrar ficha"}>
            <button
              type="button"
              onClick={onToggleContactPanel}
              aria-pressed={!!contactPanelOpen}
              aria-label={contactPanelOpen ? "Ocultar ficha" : "Mostrar ficha"}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface-light hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-strong xl:inline-flex aria-pressed:bg-nav-active aria-pressed:text-foreground"
            >
              <PanelRight size={16} aria-hidden />
            </button>
          </Tooltip>
        )}
        <Dropdown
          align="right"
          portal
          trigger={
            <button
              type="button"
              aria-label="Acciones de la conversación"
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent-strong ${detailsOpen ? "bg-nav-active text-foreground" : "text-muted hover:bg-surface-light hover:text-foreground"}`}
            >
              <MoreHorizontal size={16} />
            </button>
          }
        >
          <div className="w-56">
            {chat.contactId && leadStatus !== "CUSTOMER" && leadStatus !== "LOST" && (
              <DropdownItem icon={Trophy} className="sm:hidden" onClick={() => void markSale()}>Marcar venta</DropdownItem>
            )}
            <DropdownItem icon={SlidersHorizontal} onClick={() => setDetailsOpen((open) => !open)}>
              {detailsOpen ? "Ocultar detalles" : "Detalles"}
            </DropdownItem>
            <DropdownItem icon={Zap} onClick={() => setMacroOpen(true)}>
              Aplicar macro
            </DropdownItem>
            {canCall && (
              <DropdownItem
                icon={Phone}
                onClick={() => window.dispatchEvent(new CustomEvent("colibly-whatsapp-call", { detail: { chatId: chat.id, name } }))}
              >
                Llamar
              </DropdownItem>
            )}
            <DropdownItem
              icon={resolved ? RotateCw : Check}
              disabled={changingStatus}
              onClick={() => void changeStatus(resolved ? "OPEN" : "RESOLVED")}
            >
              {changingStatus ? "Guardando…" : resolved ? "Reabrir" : "Resolver"}
            </DropdownItem>
          </div>
        </Dropdown>
      </div>
      {detailsOpen && (
        <div className="border-t border-border bg-surface-light px-3 py-3 sm:px-4">
          <div id={detailsId} role="region" aria-labelledby={`${detailsId}-title`} className="@container flex max-h-[40dvh] flex-col overflow-hidden rounded-lg border border-accent-muted bg-surface shadow-md">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-accent-subtle/40 px-4 py-2">
              <h2 id={`${detailsId}-title`} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <SlidersHorizontal size={15} className="text-accent-ink" /> Detalles de la conversación
              </h2>
              <Button type="button" variant="ghost" size="icon" icon={X} aria-label="Cerrar detalles de la conversación" onClick={() => setDetailsOpen(false)} />
            </div>
            <div className="grid min-h-0 grid-cols-1 gap-5 overflow-y-auto p-4 @[460px]:grid-cols-2">
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold text-muted-darker">Asignación</h3>
                <ChatAssigneePicker chatId={chat.id} assignedTo={chat.assignedTo} onAssigned={onAssigned} />
              </section>
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold text-muted-darker">Equipo</h3>
                <ChatTeamPicker chatId={chat.id} team={chat.team ?? null} onAssigned={onAssigned} />
              </section>
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold text-muted-darker">Prioridad</h3>
                <ChatPriorityPicker chatId={chat.id} priority={chat.priority} onChanged={onPriorityChange} />
              </section>
              <div className="min-w-0 @[460px]:col-span-2">
                <ChatCustomFields chatId={chat.id} />
              </div>
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
              {!resolved && (
                <section className="min-w-0 space-y-2">
                  <h3 className="text-xs font-semibold text-muted-darker">Posponer</h3>
                  <ChatSnoozeControls chatId={chat.id} snoozedUntil={chat.snoozedUntil} onChanged={onSnoozedChange} />
                </section>
              )}
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold text-muted-darker">Etiquetas</h3>
                <ChatTagPicker chatId={chat.id} />
              </section>
              {(chat.channel === "WHATSAPP" || chat.channel === "TELEGRAM") && (
                <section className="min-w-0 space-y-2">
                  <h3 className="text-xs font-semibold text-muted-darker">Calificación del contacto</h3>
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

      <MacroPickerModal
        open={macroOpen}
        onClose={() => setMacroOpen(false)}
        chatId={chat.id}
        onApplied={onMacroApplied}
      />
    </header>
  );
}
