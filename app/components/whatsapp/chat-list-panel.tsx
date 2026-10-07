"use client";

import { Search, MessageSquare, Inbox, Loader2, UserRound } from "lucide-react";
import { Combobox } from "@base-ui/react/combobox";
import { Button } from "@/app/components/kit/button";
import { Badge } from "@/app/components/kit/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/app/components/kit/empty";
import { InputGroup, InputGroupAddon } from "@/app/components/kit/input-group";
import { Tabs, TabsList, TabsTab } from "@/app/components/kit/tabs";
import { Skeleton } from "@/app/components/kit/skeleton";
import { cn } from "@/app/components/kit/utils";
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { ContactAvatar } from "@/app/components/crm/contact-avatar";
import { hueClassFor } from "@/app/components/ui/hue";
import { ChatFiltersPanel } from "./chat-filters-panel";
import { ChannelGlyph } from "./channel-meta";
import {
  formatTime,
  type AccountOption,
  type CampaignOption,
  type ChatItem,
  type ChatView,
} from "./chat-shared";

// Lista de conversaciones: vistas (todos / míos / sin asignar / sin leer),
// buscador con sugerencias, filtros de campaña/respuesta y las filas en orden
// cronológico. El selector de cuenta solo se muestra debajo de `lg` (arriba de
// esa resolución, ChatAccountRail cumple ese rol como rail aparte).

const VIEWS: Array<{ value: ChatView; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "mine", label: "Míos" },
  { value: "unassigned", label: "Sin asignar" },
  { value: "unread", label: "Sin leer" },
];

interface ChatListPanelProps {
  resizable?: boolean;
  selectedChatId: string | null;
  onChatSelect: (chat: ChatItem) => void;

  accountOptions: AccountOption[];
  accountFilter: string;
  onAccountFilterChange: (id: string) => void;

  view: ChatView;
  onViewChange: (view: ChatView) => void;

  search: string;
  onSearchChange: (value: string) => void;

  campaigns: CampaignOption[];
  campaignFilter: string;
  onCampaignFilterChange: (id: string) => void;

  hasRepliedFilter: "" | "yes" | "no";
  onHasRepliedFilterChange: (value: "" | "yes" | "no") => void;

  statusFilter: "" | "RESOLVED" | "ALL";
  onStatusFilterChange: (value: "" | "RESOLVED" | "ALL") => void;

  loadingChats: boolean;
  loadError: string | null;
  onRetry: () => void;
  totalChatsLoaded: number;
  chats: ChatItem[];

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
  view,
  onViewChange,
  search,
  onSearchChange,
  campaigns,
  campaignFilter,
  onCampaignFilterChange,
  hasRepliedFilter,
  onHasRepliedFilterChange,
  statusFilter,
  onStatusFilterChange,
  loadingChats,
  loadError,
  onRetry,
  totalChatsLoaded,
  chats,
  chatsTotal,
  loadingMoreChats,
  onLoadMore,
}: ChatListPanelProps) {
  const showAccount = accountOptions.length > 1 && !accountFilter;
  // Las sugerencias salen de la misma lista autorizada y filtrada que se ve
  // debajo; el texto sigue pasando por la búsqueda paginada del servidor.
  const suggestions = chats.slice(0, 8).map((chat) => ({
    value: chat.id,
    label: `${chat.name ?? chat.remoteJid} ${chat.remoteJid}`,
    chat,
  }));
  const hasFilters = !!(search || campaignFilter || hasRepliedFilter || accountFilter || statusFilter || view !== "all");

  return (
    <div className={cn(selectedChatId ? "hidden lg:flex" : "flex", "w-full min-w-0 flex-col border-r bg-card lg:flex", !resizable && "shrink-0 lg:w-80 xl:w-96")}>
      <div className="space-y-3 border-b px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg font-semibold tracking-tight">Bandeja</h1>
          {chatsTotal > 0 && <span className="text-xs tabular-nums text-muted-foreground">{chatsTotal} {chatsTotal === 1 ? "conversación" : "conversaciones"}</span>}
        </div>

        {accountOptions.length > 1 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-thin lg:hidden">
            <Button size="xs" variant={accountFilter === "" ? "default" : "outline"} onClick={() => onAccountFilterChange("")}>
              <Inbox /> Todas
            </Button>
            {accountOptions.map((acc) => (
              <Button key={acc.id} size="xs" variant={accountFilter === acc.id ? "default" : "outline"} onClick={() => onAccountFilterChange(acc.id)}>
                {acc.name}
              </Button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Combobox.Root items={suggestions} inputValue={search}
            onInputValueChange={(value, details) => { if (!details.isItemPress) onSearchChange(value); }}
            onValueChange={(item) => { const selected = item as (typeof suggestions)[number] | null; if (selected) { onChatSelect(selected.chat); onSearchChange(""); } }}>
            <InputGroup className="min-w-0 flex-1">
              <InputGroupAddon><Search className="size-4" /></InputGroupAddon>
              <Combobox.Input aria-label="Buscar chat" placeholder="Buscar chats" className="h-8.5 min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/72 sm:h-7.5" />
            </InputGroup>
            <Combobox.Portal><Combobox.Positioner sideOffset={6} className="z-[60] w-[var(--anchor-width)]">
              <Combobox.Popup className="max-h-72 overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-lg">
                <Combobox.Empty className="px-3 py-3 text-xs text-muted-foreground">Busca un nombre o número para encontrar conversaciones.</Combobox.Empty>
                <Combobox.List>{(item: (typeof suggestions)[number]) => <Combobox.Item key={item.value} value={item} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-surface-light">
                  <ContactAvatar id={item.chat.accountId} name={item.chat.name ?? item.chat.remoteJid} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.chat.name ?? item.chat.remoteJid}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{item.chat.account.name} · {item.chat.remoteJid}</span>
                  </span>
                </Combobox.Item>}</Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner></Combobox.Portal>
          </Combobox.Root>
          <ChatFiltersPanel
            campaigns={campaigns}
            campaignFilter={campaignFilter}
            onCampaignFilterChange={onCampaignFilterChange}
            hasRepliedFilter={hasRepliedFilter}
            onHasRepliedFilterChange={onHasRepliedFilterChange}
            statusFilter={statusFilter}
            onStatusFilterChange={onStatusFilterChange}
          />
        </div>

        <Tabs value={view} onValueChange={(value) => onViewChange(value as ChatView)}>
          <TabsList className="w-full">
            {VIEWS.map((item) => <TabsTab key={item.value} value={item.value} className="px-2 text-xs">{item.label}</TabsTab>)}
          </TabsList>
        </Tabs>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {loadingChats ? (
          <div className="space-y-1 p-2" aria-busy="true" aria-label="Cargando conversaciones">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-2.5 py-2.5">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-4/5" /></div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="p-4"><ListErrorState message={loadError} onRetry={onRetry} /></div>
        ) : chats.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
              <EmptyTitle>{totalChatsLoaded === 0 && !hasFilters ? "Sin conversaciones" : "Sin resultados"}</EmptyTitle>
              <EmptyDescription>{totalChatsLoaded === 0 && !hasFilters ? "Cuando recibas mensajes aparecerán aquí." : "No hay conversaciones con esa vista o filtro."}</EmptyDescription>
            </EmptyHeader>
            {hasFilters && (
              <Button size="sm" variant="outline" onClick={() => { onSearchChange(""); onCampaignFilterChange(""); onHasRepliedFilterChange(""); onAccountFilterChange(""); onStatusFilterChange(""); onViewChange("all"); }}>
                Limpiar búsqueda y filtros
              </Button>
            )}
          </Empty>
        ) : (
          <ul className="p-1.5">
            {chats.map((chat) => {
              const name = chat.name ?? chat.remoteJid;
              const active = selectedChatId === chat.id;
              return (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => onChatSelect(chat)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "group/row flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-accent-subtle" : "hover:bg-surface-light"
                    )}
                  >
                    <span className={cn("relative mt-0.5 shrink-0", hueClassFor(chat.accountId))}>
                      <ContactAvatar id={chat.accountId} name={name} size="md" />
                      <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-card text-entity ring-2 ring-card">
                        <ChannelGlyph channel={chat.channel} size={10} />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-sm", chat.unreadCount > 0 ? "font-semibold text-foreground" : "font-medium text-foreground")}>{name}</span>
                        {chat.lastMessageAt && <span suppressHydrationWarning className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatTime(chat.lastMessageAt)}</span>}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={cn("truncate text-xs", chat.unreadCount > 0 ? "text-foreground/80" : "text-muted-foreground")}>{chat.lastMessage ?? "Sin mensajes"}</span>
                        {chat.unreadCount > 0 && <Badge size="sm" className="min-w-4.5 shrink-0 rounded-full tabular-nums">{chat.unreadCount > 99 ? "99+" : chat.unreadCount}</Badge>}
                      </span>
                      {(showAccount || chat.assignedTo || chat.campaign || chat.status !== "OPEN") && (
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                          {chat.status === "PENDING" && <Badge size="sm" variant="warning">Pendiente</Badge>}
                          {chat.status === "RESOLVED" && <Badge size="sm" variant="success">Resuelto</Badge>}
                          {showAccount && (
                            <span className={cn("inline-flex max-w-[9rem] items-center gap-1", hueClassFor(chat.accountId))}>
                              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-entity" />
                              <span className="truncate">{chat.account.name}</span>
                            </span>
                          )}
                          {chat.assignedTo && (
                            <span className="inline-flex max-w-[9rem] items-center gap-1">
                              <UserRound size={11} aria-hidden="true" className="shrink-0" />
                              <span className="truncate">{chat.assignedTo.name ?? "Asignado"}</span>
                            </span>
                          )}
                          {chat.campaign && <Badge size="sm" variant="secondary" className="max-w-[9rem] truncate">{chat.campaign.name}</Badge>}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
            {totalChatsLoaded < chatsTotal && (
              <li className="p-2">
                <Button size="sm" variant="outline" className="w-full" onClick={onLoadMore} disabled={loadingMoreChats}>
                  {loadingMoreChats ? <Loader2 className="animate-spin" /> : "Cargar más"}
                </Button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
