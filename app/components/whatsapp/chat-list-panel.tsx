"use client";

import { Search, MessageSquare, Inbox } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Spinner } from "@/app/components/ui/spinner";
import { EmptyState } from "@/app/components/ui/empty-state";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { hueClassFor } from "@/app/components/ui/hue";
import { cn } from "@/app/components/ui/cn";
import { ChatFiltersPanel } from "./chat-filters-panel";
import {
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
  totalChatsLoaded: number;
  groupedChats: Record<string, ChatItem[]>;

  chatsTotal: number;
  loadingMoreChats: boolean;
  onLoadMore: () => void;
}

export function ChatListPanel({
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
  totalChatsLoaded,
  groupedChats,
  chatsTotal,
  loadingMoreChats,
  onLoadMore,
}: ChatListPanelProps) {
  const hasResults = Object.keys(groupedChats).length > 0;

  return (
    <div className={`${selectedChatId ? "hidden md:flex" : "flex"} md:flex flex-col w-full md:w-80 lg:w-96 border-r border-border shrink-0`}>
      <div className="p-4 border-b border-border space-y-3">
        <h1 className="text-lg font-bold tracking-tight">Chats</h1>

        {accountOptions.length > 1 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:hidden scrollbar-thin">
            <button
              type="button"
              onClick={() => onAccountFilterChange("")}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                accountFilter === ""
                  ? "border-accent bg-accent text-on-accent"
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
                  "flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition-colors",
                  accountFilter === acc.id
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border bg-surface text-muted hover:bg-surface-light"
                )}
              >
                <EntityAvatar id={acc.id} name={acc.name} size="sm" />
                {acc.name}
              </button>
            ))}
          </div>
        )}

        <Input
          icon={Search}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar chat..."
        />

        <ChatFiltersPanel
          campaigns={campaigns}
          campaignFilter={campaignFilter}
          onCampaignFilterChange={onCampaignFilterChange}
          hasRepliedFilter={hasRepliedFilter}
          onHasRepliedFilterChange={onHasRepliedFilterChange}
        />
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {loadingChats ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : !hasResults ? (
          <div className="py-8">
            <EmptyState
              icon={MessageSquare}
              title="Sin chats"
              description={totalChatsLoaded === 0 ? "No tienes chats activos. Cuando recibas mensajes aparecerán aquí." : "No se encontraron chats con ese filtro."}
            />
          </div>
        ) : (
          <div>
            {Object.entries(groupedChats).map(([accountId, accountChats]) => (
              <div key={accountId}>
                <div className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-darker bg-surface/50 border-b border-border ${hueClassFor(accountId)}`}>
                  <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-entity animate-pulse-live" />
                  {accountChats[0]?.account?.name ?? accountId}
                </div>
                {accountChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => onChatSelect(chat)}
                    className={`w-full text-left px-4 py-3 border-b border-border transition-colors hover:bg-surface-light ${
                      selectedChatId === chat.id ? "bg-surface-light" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <EntityAvatar
                        id={chat.accountId}
                        name={chat.name ?? chat.remoteJid}
                        size="sm"
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {chat.name ?? chat.remoteJid}
                        </p>
                        <p className="text-xs text-muted-darker truncate mt-0.5">
                          {chat.lastMessage ?? "Sin mensajes"}
                        </p>
                        {(chat.assignedTo || chat.campaign) && (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
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
                          <span className="text-[10px] text-muted-darker">
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
