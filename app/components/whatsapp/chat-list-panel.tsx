"use client";

import { Search, MessageSquare } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Spinner } from "@/app/components/ui/spinner";
import { EmptyState } from "@/app/components/ui/empty-state";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { hueClassFor } from "@/app/components/ui/hue";
import {
  formatTime,
  campaignTone,
  HAS_REPLIED_OPTIONS,
  type AccountOption,
  type ChatItem,
  type CampaignOption,
} from "./chat-shared";

// Lista de conversaciones — buscador, filtros de campaña/respuesta, y las
// filas agrupadas por cuenta. El selector de cuenta solo se muestra debajo de
// `lg` (arriba de esa resolución, ChatAccountRail cumple ese rol como rail de
// íconos aparte). Extraído de chat-workspace.tsx sin tocar su lógica.

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
      <div className="p-4 border-b border-border space-y-2">
        <h1 className="text-lg font-bold tracking-tight mb-1">Chats</h1>
        {accountOptions.length > 1 && (
          <Select value={accountFilter} onChange={(e) => onAccountFilterChange(e.target.value)} className="lg:hidden">
            <option value="">Todos los números</option>
            {accountOptions.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}{acc.phoneNumber ? ` · ${acc.phoneNumber}` : ""}
              </option>
            ))}
          </Select>
        )}
        <Input
          icon={Search}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar chat..."
        />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Select value={campaignFilter} onChange={(e) => onCampaignFilterChange(e.target.value)} className="text-xs">
            <option value="">Todas las campañas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select
            value={hasRepliedFilter}
            onChange={(e) => onHasRepliedFilterChange(e.target.value as "" | "yes" | "no")}
            className="text-xs"
          >
            {HAS_REPLIED_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
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
