"use client";

import { Search, MessageSquare, Inbox } from "lucide-react";
import { Combobox } from "@base-ui/react/combobox";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Spinner } from "@/app/components/ui/spinner";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { hueClassFor } from "@/app/components/ui/hue";
import { cn } from "@/app/components/ui/cn";
import { ChatFiltersPanel } from "./chat-filters-panel";
import {
  displayMessageText,
  formatTime,
  campaignTone,
  type AccountOption,
  type ChatItem,
  type CampaignOption,
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

  loadingChats: boolean;
  loadError: string | null;
  onRetry: () => void;
  totalChatsLoaded: number;
  groupedChats: Record<string, ChatItem[]>;

  chatsTotal: number;
  loadingMoreChats: boolean;
  onLoadMore: () => void;
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
  loadingChats,
  loadError,
  onRetry,
  totalChatsLoaded,
  groupedChats,
  chatsTotal,
  loadingMoreChats,
  onLoadMore,
}: ChatListPanelProps) {
  const hasResults = Object.keys(groupedChats).length > 0;
  // Las sugerencias salen de la misma lista autorizada y filtrada que se ve
  // debajo; el texto sigue pasando por la búsqueda paginada del servidor.
  const suggestions = Object.values(groupedChats).flat().slice(0, 8).map((chat) => ({
    value: chat.id,
    label: `${chat.name ?? chat.remoteJid} ${chat.remoteJid}`,
    chat,
  }));

  return (
    <div className={`${selectedChatId ? "hidden lg:flex" : "flex"} lg:flex flex-col w-full ${resizable ? "" : "lg:w-80 xl:w-96 shrink-0"} min-w-0 border-r border-border`}>
      <div className="space-y-2 border-b border-border px-3 py-2">
        <h1 className="text-sm font-semibold tracking-tight">Chats</h1>

        {accountOptions.length > 1 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:hidden scrollbar-thin">
            <button
              type="button"
              onClick={() => onAccountFilterChange("")}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-[12px] border px-3 py-1.5 text-xs font-semibold transition-colors",
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
                  "flex shrink-0 items-center gap-1.5 rounded-[12px] border py-1 pl-1 pr-3 text-xs font-semibold transition-colors",
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

        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Combobox.Root items={suggestions} inputValue={search}
              onInputValueChange={(value, details) => { if (!details.isItemPress) onSearchChange(value); }}
              onValueChange={(item) => { const selected = item as (typeof suggestions)[number] | null; if (selected) { onChatSelect(selected.chat); onSearchChange(""); } }}>
              <Combobox.InputGroup className="flex h-9 items-center gap-2 rounded-[12px] border border-border bg-surface-light px-3 focus-within:border-accent-strong">
                <Search size={16} className="shrink-0 text-muted-darker" />
                <Combobox.Input aria-label="Buscar chat" placeholder="Buscar chat..." className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-darker" />
              </Combobox.InputGroup>
              <Combobox.Portal><Combobox.Positioner sideOffset={5} className="z-[60] w-[var(--anchor-width)]">
                <Combobox.Popup className="max-h-72 overflow-y-auto rounded-[12px] border border-border bg-surface p-1.5 shadow-lg">
                  <Combobox.Empty className="px-3 py-3 text-xs text-muted">Busca un nombre o número para encontrar conversaciones.</Combobox.Empty>
                  <Combobox.List>{(item: (typeof suggestions)[number]) => <Combobox.Item key={item.value} value={item} className="flex cursor-pointer flex-col gap-0.5 rounded-[9px] px-3 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-accent-subtle">
                    <span className="truncate font-medium">{item.chat.name ?? item.chat.remoteJid}</span>
                    <span className="truncate text-[11px] text-muted">{item.chat.account.name} · {item.chat.remoteJid}</span>
                  </Combobox.Item>}</Combobox.List>
                </Combobox.Popup>
              </Combobox.Positioner></Combobox.Portal>
            </Combobox.Root>
          </div>

          <ChatFiltersPanel
            campaigns={campaigns}
            campaignFilter={campaignFilter}
            onCampaignFilterChange={onCampaignFilterChange}
            hasRepliedFilter={hasRepliedFilter}
            onHasRepliedFilterChange={onHasRepliedFilterChange}
          />
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {loadingChats ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : loadError ? (
          <div className="p-4"><ListErrorState message={loadError} onRetry={onRetry} /></div>
        ) : !hasResults ? (
          <div className="py-8">
            <EmptyState
              icon={MessageSquare}
              title={totalChatsLoaded === 0 ? "Sin chats" : "Sin resultados"}
              description={totalChatsLoaded === 0 ? "No tienes chats activos. Cuando recibas mensajes aparecerán aquí." : "No se encontraron chats con ese filtro."}
              action={totalChatsLoaded > 0 && (search || campaignFilter || hasRepliedFilter || accountFilter) ? (
                <Button variant="secondary" size="sm" onClick={() => {
                  onSearchChange("");
                  onCampaignFilterChange("");
                  onHasRepliedFilterChange("");
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
                  <button
                    key={chat.id}
                    onClick={() => onChatSelect(chat)}
                    className={`chat-list-row w-full border-b border-border px-3 py-2 text-left transition-colors hover:bg-surface-light ${
                      selectedChatId === chat.id ? "bg-accent-subtle shadow-[inset_3px_0_0_var(--accent-strong)]" : ""
                    }`}
                    aria-current={selectedChatId === chat.id ? "true" : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <EntityAvatar
                        id={chat.accountId}
                        name={chat.name ?? chat.remoteJid}
                        size="sm"
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[13px] ${chat.unreadCount > 0 ? "font-bold text-foreground" : "font-medium text-foreground/80"}`}>
                          {chat.name ?? chat.remoteJid}
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
                        {chat.lastMessageAt && (
                          <span className={`text-[10px] ${chat.unreadCount > 0 ? "font-semibold text-foreground" : "text-muted-darker"}`}>
                            {formatTime(chat.lastMessageAt)}
                          </span>
                        )}
                        {chat.unreadCount > 0 && (
                          <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-accent text-on-accent text-[10px] font-bold">
                            {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
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
      </div>
    </div>
  );
}
