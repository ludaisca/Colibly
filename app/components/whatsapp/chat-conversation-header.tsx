"use client";

import { Tooltip } from "@/app/components/ui/tooltip";
import { displayName } from "@/lib/chats/display-name";
import { useId, useState } from "react";
import { ArrowLeft, Check, MoreVertical, Phone, RotateCw, SlidersHorizontal, X, Zap } from "lucide-react";
import { ChannelAvatar } from "@/app/components/ui/channel-avatar";
import { useHueClass } from "@/app/components/ui/account-hues";
import { cn } from "@/app/components/ui/cn";
import { Button } from "@/app/components/ui/button";
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
};

// Andén: la venta como una línea con estaciones, en el color de la cuenta.
// Sale de Contact.leadStatus (el mismo que cambia la ficha y el pipeline).
const ROUTE: Array<{ status: NonNullable<ChatItem["leadStatus"]>; label: string }> = [
  { status: "NEW", label: "Nuevo" },
  { status: "CONTACTED", label: "Contactado" },
  { status: "QUALIFIED", label: "Calificado" },
  { status: "CUSTOMER", label: "Cliente" },
];

function SalesRoute({ status, accountId }: { status: NonNullable<ChatItem["leadStatus"]>; accountId: string }) {
  const hueClassFor = useHueClass();
  const lost = status === "LOST";
  const current = ROUTE.findIndex((s) => s.status === status);
  const label = lost ? "Etapa del lead: perdido" : `Etapa del lead: ${ROUTE[current]?.label} (${current + 1} de ${ROUTE.length})`;
  return (
    <div className={cn("flex items-center gap-3 px-3 pb-2.5 pt-1", hueClassFor(accountId))}>
      <ol aria-label={label} className="relative flex min-w-0 flex-1">
        {/* Vía: llena hasta la estación actual, gris después. */}
        <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-[5px] h-1 rounded-full bg-border" />
        {!lost && current > 0 && (
          <span aria-hidden className="absolute left-[12.5%] top-[5px] h-1 rounded-full bg-entity" style={{ width: `${(current / (ROUTE.length - 1)) * 75}%` }} />
        )}
        {ROUTE.map((station, index) => {
          const done = !lost && index < current;
          const now = !lost && index === current;
          return (
            <li key={station.status} aria-current={now ? "step" : undefined} className="relative z-[1] flex flex-1 flex-col items-center gap-1">
              <span
                aria-hidden
                className={cn(
                  "box-border rounded-full border-[3px]",
                  now ? "h-3.5 w-3.5 -mt-0.5 border-entity bg-surface" : done ? "h-2.5 w-2.5 border-entity bg-entity" : "h-2.5 w-2.5 border-border bg-surface"
                )}
              />
              <span className={cn("text-micro leading-none", now ? "font-bold text-foreground" : "text-muted")}>{station.label}</span>
            </li>
          );
        })}
      </ol>
      {lost && <span className="shrink-0 rounded-full border border-border bg-surface-light px-2 py-0.5 text-micro font-bold text-muted">Perdido</span>}
    </div>
  );
}

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
}

export function ChatConversationHeader({ chat, refreshKey, typingUsers, onCloseChat, onOpenContactDrawer, onStatusChange, onAssigned, onPriorityChange, onSnoozedChange, onMacroApplied }: Props) {
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
      <div className="flex items-center gap-2.5 px-3 py-1">
        <Button type="button" variant="ghost" size="icon" icon={ArrowLeft} onClick={onCloseChat} aria-label="Volver a la lista de chats" className="lg:hidden" />
        <ChannelAvatar id={chat.accountId} name={name} channel={chat.channel} size="sm" />
        <div className="min-w-0 flex-1">
          {chat.contactId ? (
            <Tooltip label="Ver contacto"><button type="button" onClick={onOpenContactDrawer} className="block max-w-full truncate rounded text-left text-base font-semibold text-foreground hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-strong">{name}</button></Tooltip>
          ) : <p className="truncate text-base font-semibold text-foreground">{name}</p>}
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-micro text-muted-darker" title={subtitle}>
            {/* Sin icono de canal: la insignia del avatar ya lo muestra. */}
            <span className="truncate">{subtitle}</span>
            {resolved && <span className="shrink-0 rounded-full bg-success-bg px-1.5 text-micro font-medium text-success">Resuelto</span>}
          </p>
          {typingLabel && (
            <p className="mt-0.5 truncate text-micro font-medium text-accent-ink motion-safe:animate-pulse">{typingLabel}</p>
          )}
        </div>
        <Dropdown
          align="right"
          portal
          trigger={
            <button
              type="button"
              aria-label="Acciones de la conversación"
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-accent-strong ${detailsOpen ? "bg-accent-subtle text-accent-ink" : "text-muted-darker hover:bg-surface-light hover:text-foreground"}`}
            >
              <MoreVertical size={17} />
            </button>
          }
        >
          <div className="w-56">
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
      {chat.contactId && chat.leadStatus && <SalesRoute status={chat.leadStatus} accountId={chat.accountId} />}
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

      <MacroPickerModal
        open={macroOpen}
        onClose={() => setMacroOpen(false)}
        chatId={chat.id}
        onApplied={onMacroApplied}
      />
    </header>
  );
}
