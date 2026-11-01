"use client";

import { displayName, isWebchatVisitorId } from "@/lib/chats/display-name";
import type { ElementType, ReactNode } from "react";
import { GettingStarted } from "@/app/components/ui/getting-started";
import { Search, MessageSquare, Inbox, Flag, Clock, ListChecks, UserCheck, Check, X } from "lucide-react";
import { Combobox } from "@base-ui/react/combobox";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Spinner } from "@/app/components/ui/spinner";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { ChannelAvatar } from "@/app/components/ui/channel-avatar";
import { hueClassFor } from "@/app/components/ui/hue";
import { cn } from "@/app/components/ui/cn";
import { ChatFiltersPanel, type AssignedFilter, type SnoozedFilter } from "./chat-filters-panel";
import { ChatViewsMenu } from "./chat-views-menu";
import { useNowMs } from "./use-now";
import { WaitingBadge } from "./waiting-badge";
import {
  displayMessageText,
  formatTime,
  formatSnoozeUntil,
  snoozeUntilFor,
  PRIORITY_META,
  campaignTone,
  type AccountOption,
  type ChatBulkAction,
  type ChatItem,
  type CampaignOption,
  type ChatPriority,
} from "./chat-shared";

// Lista de conversaciones — buscador, filtros de campaña/respuesta, y las
// filas agrupadas por cuenta. El selector de cuenta solo se muestra debajo de
// `lg` (arriba de esa resolución, ChatAccountRail cumple ese rol como rail de
// íconos aparte) — pero como fila de chips desplazable, no como <select>
// nativo, para que se sienta como una extensión del rail y no como un form.
// Los filtros de campaña/respuesta viven en ChatFiltersPanel (botón "Filtros"
// + constructor de condiciones aplicar/limpiar) en vez de mostrarse siempre
// como controles sueltos. Extraído de chat-workspace.tsx sin tocar su lógica
// de datos/handlers.

function BulkButton({
  icon: Icon,
  children,
  onClick,
  disabled,
}: {
  icon: ElementType;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 items-center gap-1 rounded-[9px] border border-accent-muted bg-surface px-2 text-[11px] font-semibold text-accent-ink transition-colors hover:bg-accent-subtle disabled:opacity-50"
    >
      <Icon size={12} />
      {children}
    </button>
  );
}

interface ChatListPanelProps {
  resizable?: boolean;
  selectedChatId: string | null;
  onChatSelect: (chat: ChatItem) => void;

  accountOptions: AccountOption[];
  accountFilter: string;
  onAccountFilterChange: (id: string) => void;

  search: string;
  onSearchChange: (value: string) => void;

  campaigns: CampaignOption[];
  campaignFilter: string;
  onCampaignFilterChange: (id: string) => void;

  hasRepliedFilter: "" | "yes" | "no";
  onHasRepliedFilterChange: (value: "" | "yes" | "no") => void;

  assignedFilter: AssignedFilter;
  onAssignedFilterChange: (value: AssignedFilter) => void;
  priorityFilter: ChatPriority | "";
  onPriorityFilterChange: (value: ChatPriority | "") => void;
  snoozedFilter: SnoozedFilter;
  onSnoozedFilterChange: (value: SnoozedFilter) => void;
  awaitingFilter: boolean;
  onAwaitingFilterChange: (value: boolean) => void;

  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  selectedChatIds: Set<string>;
  onToggleSelect: (chatId: string) => void;
  onBulkAction: (action: ChatBulkAction) => void;
  bulkBusy: boolean;
  currentViewQuery: string;
  onApplyView: (query: string) => void;

  loadingChats: boolean;
  loadError: string | null;
  onRetry: () => void;
  totalChatsLoaded: number;
  groupedChats: Record<string, ChatItem[]>;

  chatsTotal: number;
  loadingMoreChats: boolean;
  onLoadMore: () => void;
  /** Sección "En mensajes" (búsqueda dentro de las conversaciones). */
  messageResults?: ReactNode;
}

export function ChatListPanel({
  resizable = false,
  selectedChatId,
  onChatSelect,
  accountOptions,
  accountFilter,
  onAccountFilterChange,
  search,
  onSearchChange,
  campaigns,
  campaignFilter,
  onCampaignFilterChange,
  hasRepliedFilter,
  onHasRepliedFilterChange,
  assignedFilter,
  onAssignedFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  snoozedFilter,
  onSnoozedFilterChange,
  awaitingFilter,
  onAwaitingFilterChange,
  selectionMode,
  onToggleSelectionMode,
  selectedChatIds,
  onToggleSelect,
  onBulkAction,
  bulkBusy,
  currentViewQuery,
  onApplyView,
  loadingChats,
  loadError,
  onRetry,
  totalChatsLoaded,
  groupedChats,
  chatsTotal,
  loadingMoreChats,
  onLoadMore,
  messageResults,
}: ChatListPanelProps) {
  const now = useNowMs();
  const hasResults = Object.keys(groupedChats).length > 0;
  // Las sugerencias salen de la misma lista autorizada y filtrada que se ve
  // debajo; el texto sigue pasando por la búsqueda paginada del servidor.
  const suggestions = Object.values(groupedChats).flat().slice(0, 8).map((chat) => ({
    value: chat.id,
    label: `${displayName(chat.name, chat.remoteJid)} ${chat.remoteJid}`,
    chat,
  }));

  return (
    <div className={`${selectedChatId ? "hidden lg:flex" : "flex"} lg:flex flex-col w-full ${resizable ? "" : "lg:w-80 xl:w-96 shrink-0"} min-w-0 border-r border-border`}>
      <div className="space-y-2 border-b border-border px-3 py-2">
        {/* Cabecera estilo Chatwoot: título a la izquierda y acciones de icono
            a la derecha; nunca compiten por espacio con la búsqueda. */}
        <div className="flex items-center gap-1">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">Chats</h1>
          <ChatViewsMenu currentQuery={currentViewQuery} onApply={onApplyView} />

          <button
            type="button"
            aria-label={selectionMode ? "Cancelar selección" : "Seleccionar chats"}
            title={selectionMode ? "Cancelar selección" : "Seleccionar chats"}
            aria-pressed={selectionMode}
            onClick={onToggleSelectionMode}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] transition-colors",
              selectionMode
                ? "bg-accent-subtle text-accent-ink"
                : "text-muted-darker hover:bg-surface-light hover:text-foreground"
            )}
          >
            {selectionMode ? <X size={15} /> : <ListChecks size={15} />}
          </button>

          <ChatFiltersPanel
            campaigns={campaigns}
            campaignFilter={campaignFilter}
            onCampaignFilterChange={onCampaignFilterChange}
            hasRepliedFilter={hasRepliedFilter}
            onHasRepliedFilterChange={onHasRepliedFilterChange}
            assignedFilter={assignedFilter}
            onAssignedFilterChange={onAssignedFilterChange}
            priorityFilter={priorityFilter}
            onPriorityFilterChange={onPriorityFilterChange}
            snoozedFilter={snoozedFilter}
            onSnoozedFilterChange={onSnoozedFilterChange}
            awaitingFilter={awaitingFilter}
            onAwaitingFilterChange={onAwaitingFilterChange}
          />
        </div>

        {accountOptions.length > 1 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:hidden scrollbar-none">
            <button
              type="button"
              onClick={() => onAccountFilterChange("")}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-[9px] border px-3 py-1.5 text-xs font-semibold transition-colors",
                accountFilter === ""
                  ? "border-accent-strong bg-accent text-on-accent"
                  : "border-border bg-surface text-muted hover:bg-surface-light"
              )}
            >
              <Inbox size={13} /> Todos
            </button>
            {accountOptions.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => onAccountFilterChange(acc.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-[9px] border py-1 pl-1 pr-3 text-xs font-semibold transition-colors",
                  accountFilter === acc.id
                    ? "border-accent-strong bg-accent text-on-accent"
                    : "border-border bg-surface text-muted hover:bg-surface-light"
                )}
              >
                <EntityAvatar id={acc.id} name={acc.name} size="sm" />
                {acc.name}
              </button>
            ))}
          </div>
        )}

        {/* Búsqueda en su propia fila, a todo lo ancho (como Chatwoot): con la
            lista angosta ya no se encima con los botones de la cabecera. */}
        <div className="min-w-0">
          <Combobox.Root items={suggestions} inputValue={search}
            onInputValueChange={(value, details) => { if (!details.isItemPress) onSearchChange(value); }}
            onValueChange={(item) => { const selected = item as (typeof suggestions)[number] | null; if (selected) { onChatSelect(selected.chat); onSearchChange(""); } }}>
            <Combobox.InputGroup className="flex h-[38px] items-center gap-2 rounded-[9px] border border-border bg-surface-light px-3 focus-within:border-accent-strong">
              <Search size={16} className="shrink-0 text-muted-darker" />
              <Combobox.Input data-inbox-search aria-label="Buscar chat (atajo: /)" placeholder="Buscar chat..." className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-darker" />
            </Combobox.InputGroup>
            <Combobox.Portal><Combobox.Positioner sideOffset={5} className="z-[60] w-[var(--anchor-width)]">
              <Combobox.Popup className="max-h-72 overflow-y-auto rounded-lg border border-border bg-surface p-1.5 shadow-lg">
                <Combobox.Empty className="px-3 py-3 text-xs text-muted">Busca un nombre o número para encontrar conversaciones.</Combobox.Empty>
                <Combobox.List>{(item: (typeof suggestions)[number]) => <Combobox.Item key={item.value} value={item} className="flex cursor-pointer flex-col gap-0.5 rounded-[9px] px-3 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-accent-subtle">
                  <span className="truncate font-medium">{displayName(item.chat.name, item.chat.remoteJid)}</span>
                  <span className="truncate text-[11px] text-muted">{item.chat.account.name}{isWebchatVisitorId(item.chat.remoteJid) ? "" : ` · ${item.chat.remoteJid}`}</span>
                </Combobox.Item>}</Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner></Combobox.Portal>
          </Combobox.Root>
        </div>

        {selectionMode && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-[9px] bg-accent-subtle px-2 py-1.5">
            <span className="mr-1 text-[11px] font-semibold text-accent-ink">
              {selectedChatIds.size > 0 ? `${selectedChatIds.size} seleccionados` : "Selecciona chats"}
            </span>
            {selectedChatIds.size > 0 && (
              <>
                <BulkButton icon={UserCheck} disabled={bulkBusy} onClick={() => onBulkAction({ type: "assign", self: true })}>
                  Asignarme
                </BulkButton>
                <BulkButton icon={Check} disabled={bulkBusy} onClick={() => onBulkAction({ type: "status", status: "RESOLVED" })}>
                  Resolver
                </BulkButton>
                <BulkButton icon={Clock} disabled={bulkBusy} onClick={() => onBulkAction({ type: "snooze", until: snoozeUntilFor("1h") })}>
                  1 h
                </BulkButton>
                <BulkButton icon={Flag} disabled={bulkBusy} onClick={() => onBulkAction({ type: "priority", priority: "HIGH" })}>
                  Alta
                </BulkButton>
              </>
            )}
          </div>
        )}
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {loadingChats ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : loadError ? (
          <div className="p-4"><ListErrorState message={loadError} onRetry={onRetry} /></div>
        ) : !hasResults && totalChatsLoaded === 0 && !(search || campaignFilter || hasRepliedFilter || accountFilter || assignedFilter || priorityFilter || snoozedFilter || awaitingFilter) ? (
          <GettingStarted
            title="Tu bandeja está lista"
            description="Aquí llegan los mensajes de todos tus canales. Conecta uno para empezar a recibirlos."
            memberHint="Aquí verás los chats de las cuentas que tienes asignadas. Si no llega nada, pide a un administrador que te comparta una cuenta."
          />
        ) : !hasResults ? (
          <div className="py-8">
            <EmptyState
              icon={MessageSquare}
              title={totalChatsLoaded === 0 ? "Sin chats" : "Sin resultados"}
              description={totalChatsLoaded === 0 ? "No tienes chats activos. Cuando recibas mensajes aparecerán aquí." : "No se encontraron chats con ese filtro."}
              action={totalChatsLoaded > 0 && (search || campaignFilter || hasRepliedFilter || accountFilter || assignedFilter || priorityFilter || snoozedFilter || awaitingFilter) ? (
                <Button variant="secondary" size="sm" onClick={() => {
                  onSearchChange("");
                  onCampaignFilterChange("");
                  onHasRepliedFilterChange("");
                  onAssignedFilterChange("");
                  onPriorityFilterChange("");
                  onSnoozedFilterChange("");
                  onAwaitingFilterChange(false);
                  onAccountFilterChange("");
                }}>Limpiar búsqueda y filtros</Button>
              ) : undefined}
            />
          </div>
        ) : (
          <div>
            {Object.entries(groupedChats).map(([accountId, accountChats]) => (
              <div key={accountId}>
                <div className={`flex items-center gap-1.5 border-b border-border bg-surface/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-darker ${hueClassFor(accountId)}`}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-entity" />
                  {accountChats[0]?.account?.name ?? accountId}
                </div>
                {accountChats.map((chat) => (
                  <div key={chat.id} className="relative">
                    {selectionMode && (
                      <input
                        type="checkbox"
                        checked={selectedChatIds.has(chat.id)}
                        onChange={() => onToggleSelect(chat.id)}
                        aria-label={`Seleccionar ${displayName(chat.name, chat.remoteJid)}`}
                        className="absolute left-3 top-4 z-10 h-4 w-4 cursor-pointer rounded border-border accent-[var(--accent)]"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => selectionMode ? onToggleSelect(chat.id) : onChatSelect(chat)}
                      className={cn(
                        "chat-list-row w-full border-b border-border py-2 text-left transition-colors hover:bg-surface-light",
                        selectionMode ? "pl-9 pr-3" : "px-3",
                        selectedChatId === chat.id && "bg-accent-subtle shadow-[inset_3px_0_0_var(--accent-strong)]"
                      )}
                      aria-current={selectedChatId === chat.id ? "true" : undefined}
                    >
                    <div className="flex items-start justify-between gap-2">
                      <ChannelAvatar
                        id={chat.accountId}
                        name={displayName(chat.name, chat.remoteJid)}
                        channel={chat.channel}
                        size="sm"
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[13px] ${chat.unreadCount > 0 ? "font-bold text-foreground" : "font-medium text-foreground/80"}`}>
                          {displayName(chat.name, chat.remoteJid)}
                        </p>
                        <p className={`mt-0.5 truncate text-[11px] ${chat.unreadCount > 0 ? "font-medium text-foreground" : "text-muted-darker"}`}>
                          {displayMessageText(chat.lastMessage) ?? "Sin mensajes"}
                        </p>
                        {(chat.assignedTo || chat.campaign) && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {chat.assignedTo && (
                              <Badge tone="info" size="sm">
                                {chat.assignedTo.name ?? "Asignado"}
                              </Badge>
                            )}
                            {chat.campaign && (
                              <Badge tone={campaignTone(chat.campaign.id)} size="sm" className="max-w-[10rem] truncate">
                                {chat.campaign.name}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="flex items-center gap-1">
                          {chat.priority !== "NORMAL" && (
                            <span
                              title={`Prioridad ${PRIORITY_META[chat.priority].label.toLowerCase()}`}
                              className={PRIORITY_META[chat.priority].text}
                            >
                              <Flag size={10} fill="currentColor" />
                            </span>
                          )}
                          {chat.snoozedUntil && new Date(chat.snoozedUntil).getTime() > now && (
                            <span
                              title={`Pospuesto hasta ${formatSnoozeUntil(chat.snoozedUntil)}`}
                              className="text-muted-darker"
                            >
                              <Clock size={10} />
                            </span>
                          )}
                          {chat.lastMessageAt && (
                            <span className={`text-[10px] ${chat.unreadCount > 0 ? "font-semibold text-foreground" : "text-muted-darker"}`}>
                              {formatTime(chat.lastMessageAt)}
                            </span>
                          )}
                        </span>
                        {chat.unreadCount > 0 && (
                          <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-accent text-on-accent text-[10px] font-bold">
                            {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                          </span>
                        )}
                        {now > 0 && chat.waitingSince && chat.status !== "RESOLVED" && (
                          <WaitingBadge since={chat.waitingSince} now={now} />
                        )}
                      </div>
                    </div>
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {totalChatsLoaded < chatsTotal && (
              <div className="p-3">
                <Button variant="secondary" size="sm" fullWidth onClick={onLoadMore} disabled={loadingMoreChats}>
                  {loadingMoreChats ? <Spinner /> : "Cargar más"}
                </Button>
              </div>
            )}
          </div>
        )}
        {!loadingChats && messageResults}
      </div>
    </div>
  );
}
