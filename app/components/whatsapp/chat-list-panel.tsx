"use client";

import { Tooltip } from "@/app/components/ui/tooltip";
import { displayName, isWebchatVisitorId } from "@/lib/chats/display-name";
import type { ElementType, ReactNode } from "react";
import { GettingStarted } from "@/app/components/ui/getting-started";
import { Search, MessageSquare, Flag, Clock, ListChecks, UserCheck, Check, X } from "lucide-react";
import { Combobox } from "@base-ui/react/combobox";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Spinner } from "@/app/components/ui/spinner";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { ChannelAvatar } from "@/app/components/ui/channel-avatar";
import { useHueClass } from "@/app/components/ui/account-hues";
import { cn } from "@/app/components/ui/cn";
import { ChatFiltersPanel, type AssignedFilter, type SnoozedFilter } from "./chat-filters-panel";
import { ChatViewsMenu } from "./chat-views-menu";
import { useNowMs } from "./use-now";
import { SlaBadge, WaitCells } from "./waiting-badge";
import { ChatRowMenu } from "./chat-row-menu";
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
  type ChatRowAction,
  type CampaignOption,
  type ChatPriority,
  type ViewCounts,
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
      className="inline-flex h-7 items-center gap-1 rounded-[9px] border border-accent-muted bg-surface px-2 text-micro font-semibold text-accent-ink transition-colors hover:bg-accent-subtle disabled:opacity-50"
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
  /** Vista rápida "Fuera de SLA" activa (no tiene control propio en el panel de filtros). */
  slaFilter?: boolean;

  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  selectedChatIds: Set<string>;
  onToggleSelect: (chatId: string) => void;
  onBulkAction: (action: ChatBulkAction) => void;
  /** Menú contextual de cada fila (clic derecho / pulsación larga). */
  onRowAction: (chat: ChatItem, action: ChatRowAction) => void;
  currentUserId?: string | null;
  bulkBusy: boolean;
  currentViewQuery: string;
  onApplyView: (query: string) => void;
  viewCounts: ViewCounts | null;

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
  slaFilter = false,
  selectionMode,
  onToggleSelectionMode,
  selectedChatIds,
  onToggleSelect,
  onBulkAction,
  onRowAction,
  currentUserId,
  bulkBusy,
  currentViewQuery,
  onApplyView,
  viewCounts,
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
  const hueClassFor = useHueClass();
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
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-bold leading-none">Chats</h1>
            <p className="mt-1 truncate text-micro text-muted">{awaitingFilter ? "Ordenado por espera" : "Por último mensaje"}</p>
          </div>
          <ChatViewsMenu currentQuery={currentViewQuery} onApply={onApplyView} counts={viewCounts} />

          <Tooltip label={selectionMode ? "Cancelar selección" : "Seleccionar chats"}><button
            type="button"
            aria-label={selectionMode ? "Cancelar selección" : "Seleccionar chats"}
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
          </button></Tooltip>

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
          // Andén: cada cuenta es una "línea" con su color (el mismo hue de la
          // franja de sus filas). Arriba de lg, el rail de cuentas hace esto.
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:hidden scrollbar-none" role="group" aria-label="Cuentas">
            <button
              type="button"
              onClick={() => onAccountFilterChange("")}
              aria-pressed={accountFilter === ""}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                accountFilter === "" ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-muted hover:bg-surface-light"
              )}
            >
              Todas
            </button>
            {accountOptions.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => onAccountFilterChange(acc.id)}
                aria-pressed={accountFilter === acc.id}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-3 text-xs font-semibold transition-colors",
                  hueClassFor(acc.id),
                  accountFilter === acc.id ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-foreground hover:bg-surface-light"
                )}
              >
                <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full bg-entity" />
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
              <Combobox.Input data-inbox-search aria-label="Buscar chat (atajo: /)" placeholder="Buscar chat…" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-darker" />
            </Combobox.InputGroup>
            <Combobox.Portal><Combobox.Positioner sideOffset={5} className="z-[60] w-[var(--anchor-width)]">
              <Combobox.Popup className="max-h-72 overflow-y-auto rounded-lg border border-border bg-surface p-1.5 shadow-lg">
                <Combobox.Empty className="px-3 py-3 text-xs text-muted">Busca un nombre o número para encontrar conversaciones.</Combobox.Empty>
                <Combobox.List>{(item: (typeof suggestions)[number]) => <Combobox.Item key={item.value} value={item} className="flex cursor-pointer flex-col gap-0.5 rounded-[9px] px-3 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-accent-subtle">
                  <span className="truncate font-medium">{displayName(item.chat.name, item.chat.remoteJid)}</span>
                  <span className="truncate text-micro text-muted">{item.chat.account.name}{isWebchatVisitorId(item.chat.remoteJid) ? "" : ` · ${item.chat.remoteJid}`}</span>
                </Combobox.Item>}</Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner></Combobox.Portal>
          </Combobox.Root>
        </div>

        {selectionMode && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-[9px] bg-accent-subtle px-2 py-1.5">
            <span className="mr-1 text-micro font-semibold text-accent-ink">
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
      {/* Cabecera del tablero: qué se ve y por qué columna se ordena. */}
      <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-2">
        <div className="inline-flex rounded-full bg-surface-light p-0.5" role="group" aria-label="Qué chats ver">
          <button
            type="button"
            aria-pressed={awaitingFilter}
            onClick={() => onAwaitingFilterChange(true)}
            className={cn("rounded-full px-3 py-1 text-micro font-semibold uppercase tracking-wider transition-colors", awaitingFilter ? "bg-foreground text-background" : "text-muted hover:text-foreground")}
          >
            Esperando{viewCounts ? ` ${viewCounts.awaiting}` : ""}
          </button>
          <button
            type="button"
            aria-pressed={!awaitingFilter}
            onClick={() => onAwaitingFilterChange(false)}
            className={cn("rounded-full px-3 py-1 text-micro font-semibold uppercase tracking-wider transition-colors", !awaitingFilter ? "bg-foreground text-background" : "text-muted hover:text-foreground")}
          >
            Todos
          </button>
        </div>
        <span className="text-micro font-semibold uppercase tracking-[0.12em] text-muted">{awaitingFilter ? "Espera" : "Último"}</span>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {loadingChats ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : loadError ? (
          <div className="p-4"><ListErrorState message={loadError} onRetry={onRetry} /></div>
        ) : !hasResults && totalChatsLoaded === 0 && !(search || campaignFilter || hasRepliedFilter || accountFilter || assignedFilter || priorityFilter || snoozedFilter || awaitingFilter || slaFilter) ? (
          <GettingStarted
            title="Tu bandeja está lista"
            description="Aquí llegan los mensajes de todos tus canales. Conecta uno para empezar a recibirlos."
            memberHint="Aquí verás los chats de las cuentas que tienes asignadas. Si no llega nada, pide a un administrador que te comparta una cuenta."
          />
        ) : !hasResults ? (
          <div className="py-8">
            <EmptyState
              icon={MessageSquare}
              title={awaitingFilter && !search ? "Nadie espera respuesta" : totalChatsLoaded === 0 ? "Sin chats" : "Sin resultados"}
              description={awaitingFilter && !search
                ? "Cuando un cliente escriba y nadie le conteste, aparecerá aquí con su tiempo de espera."
                : totalChatsLoaded === 0 ? "No tienes chats activos. Cuando recibas mensajes aparecerán aquí." : "No se encontraron chats con ese filtro."}
              action={totalChatsLoaded > 0 && (search || campaignFilter || hasRepliedFilter || accountFilter || assignedFilter || priorityFilter || snoozedFilter || awaitingFilter || slaFilter) ? (
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
          <>
          <ul className="grid gap-1 px-2 pb-2">
            {Object.values(groupedChats).flat().map((chat) => {
              const name = displayName(chat.name, chat.remoteJid);
              const waiting = now > 0 && !!chat.waitingSince && chat.status !== "RESOLVED";
              const selected = selectedChatId === chat.id;
              return (
                <li key={chat.id} className="relative">
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedChatIds.has(chat.id)}
                      onChange={() => onToggleSelect(chat.id)}
                      aria-label={`Seleccionar ${name}`}
                      className="absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 cursor-pointer rounded border-border accent-[var(--accent)]"
                    />
                  )}
                  <ChatRowMenu chat={chat} currentUserId={currentUserId} onAction={onRowAction} disabled={selectionMode}>
                    <button
                      type="button"
                      onClick={() => selectionMode ? onToggleSelect(chat.id) : onChatSelect(chat)}
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "chat-list-row flex w-full items-stretch overflow-hidden rounded-lg text-left transition-colors",
                        // Andén, regla de la tinta: el chat abierto se marca con contorno de tinta.
                        selected ? "bg-surface ring-2 ring-inset ring-foreground" : "bg-surface hover:bg-surface-light",
                        hueClassFor(chat.accountId)
                      )}
                    >
                      {/* Línea de la cuenta. */}
                      <span aria-hidden className="w-1 shrink-0 bg-entity" />
                      <span className={cn("flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-2.5", selectionMode ? "pl-9" : "pl-2.5")}>
                        <ChannelAvatar id={chat.accountId} name={name} channel={chat.channel} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm", chat.unreadCount > 0 ? "font-bold text-foreground" : "font-semibold text-foreground")}>
                            {name}
                          </span>
                          <span className={cn("mt-0.5 block truncate text-xs", chat.unreadCount > 0 ? "font-medium text-foreground" : "text-muted")}>
                            {displayMessageText(chat.lastMessage) ?? "Sin mensajes"}
                          </span>
                          {(chat.assignedTo || chat.campaign) && (
                            <span className="mt-1 flex flex-wrap items-center gap-1">
                              {chat.assignedTo && <Badge tone="info" size="sm">{chat.assignedTo.name ?? "Asignado"}</Badge>}
                              {chat.campaign && (
                                <Badge tone={campaignTone(chat.campaign.id)} size="sm" className="max-w-[10rem] truncate">
                                  {chat.campaign.name}
                                </Badge>
                              )}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {waiting && chat.waitingSince ? (
                            <WaitCells since={chat.waitingSince} now={now} overdue={!!chat.sla?.responseBreached} />
                          ) : chat.lastMessageAt ? (
                            <span className={cn("text-micro tabular-nums", chat.unreadCount > 0 ? "font-semibold text-foreground" : "text-muted")}>
                              {formatTime(chat.lastMessageAt)}
                            </span>
                          ) : null}
                          <span className="flex items-center gap-1">
                            {chat.priority !== "NORMAL" && (
                              <span title={`Prioridad ${PRIORITY_META[chat.priority].label.toLowerCase()}`} className={PRIORITY_META[chat.priority].text}>
                                <Flag size={11} fill="currentColor" aria-hidden />
                                <span className="sr-only">Prioridad {PRIORITY_META[chat.priority].label.toLowerCase()}</span>
                              </span>
                            )}
                            {chat.snoozedUntil && new Date(chat.snoozedUntil).getTime() > now && (
                              <span title={`Pospuesto hasta ${formatSnoozeUntil(chat.snoozedUntil)}`} className="text-muted">
                                <Clock size={11} aria-hidden />
                                <span className="sr-only">Pospuesto</span>
                              </span>
                            )}
                            {(chat.sla?.resolutionBreached || (!waiting && chat.sla?.responseBreached)) && (
                              <SlaBadge response={!!chat.sla?.responseBreached} />
                            )}
                            {chat.unreadCount > 0 && (
                              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-micro font-bold tabular-nums text-background">
                                {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                                <span className="sr-only"> sin leer</span>
                              </span>
                            )}
                          </span>
                        </span>
                      </span>
                    </button>
                  </ChatRowMenu>
                </li>
              );
            })}
          </ul>
          <div>
            {totalChatsLoaded < chatsTotal && (
              <div className="p-3">
                <Button variant="secondary" size="sm" fullWidth onClick={onLoadMore} disabled={loadingMoreChats}>
                  {loadingMoreChats ? <Spinner /> : "Cargar más"}
                </Button>
              </div>
            )}
          </div>
          </>
        )}
        {!loadingChats && messageResults}
      </div>
    </div>
  );
}
