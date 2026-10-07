"use client";

import { useState } from "react";
import { ArrowLeft, Check, PanelRight, RotateCw } from "lucide-react";
import { Button } from "@/app/components/kit/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/app/components/kit/tooltip";
import { cn } from "@/app/components/kit/utils";
import { ContactAvatar } from "@/app/components/crm/contact-avatar";
import { ChatAssigneePicker } from "./chat-assignee-picker";
import { ChatBotMode } from "./chat-bot-mode";
import { CHANNELS, ChannelGlyph } from "./channel-meta";
import { STATUS_BADGE, type ChatItem, type ChatStatus } from "./chat-shared";

// Cabecera del hilo: quién es, por qué canal/cuenta, quién lo atiende y las dos
// acciones frecuentes (resolver y abrir la ficha). El resto — etiquetas,
// calificación, consumo de IA, automatizaciones — vive en el panel lateral.

interface Props {
  chat: ChatItem;
  refreshKey: string;
  sidePanelOpen: boolean;
  onCloseChat: () => void;
  onToggleSidePanel: () => void;
  onStatusChange: (status: ChatStatus) => void | Promise<void>;
  onAssigned: (assignee: { id: string; name: string | null } | null) => void;
}

const STATUS_DOT: Record<ChatStatus, string> = { OPEN: "bg-info", PENDING: "bg-warning", RESOLVED: "bg-success" };

export function ChatConversationHeader({ chat, refreshKey, sidePanelOpen, onCloseChat, onToggleSidePanel, onStatusChange, onAssigned }: Props) {
  const [changingStatus, setChangingStatus] = useState(false);
  const channel = CHANNELS[chat.channel];
  const name = chat.name || chat.remoteJid;
  const resolved = chat.status === "RESOLVED";

  async function changeStatus(status: ChatStatus) {
    if (changingStatus) return;
    setChangingStatus(true);
    try { await onStatusChange(status); } finally { setChangingStatus(false); }
  }

  return (
    <header className="@container flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 basis-40 items-center gap-3">
        <Button variant="ghost" size="icon-sm" aria-label="Volver a la lista de chats" onClick={onCloseChat} className="lg:hidden">
          <ArrowLeft />
        </Button>
        <ContactAvatar id={chat.accountId} name={name} size="md" />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{name}</h2>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={`${channel.label} · ${chat.account.name}`}>
            <ChannelGlyph channel={chat.channel} />
            <span className="truncate">{channel.label} · {chat.account.name}</span>
            <span aria-hidden="true" className="text-border">|</span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <span aria-hidden="true" className={cn("size-1.5 rounded-full", STATUS_DOT[chat.status])} />
              {STATUS_BADGE[chat.status].label}
            </span>
          </p>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <ChatBotMode chatId={chat.id} refreshKey={refreshKey} compact />
        <ChatAssigneePicker chatId={chat.id} assignedTo={chat.assignedTo} onAssigned={onAssigned} />
        <Button variant="outline" size="sm" title={resolved ? "Reabrir conversación" : "Marcar como resuelta"} loading={changingStatus} onClick={() => changeStatus(resolved ? "OPEN" : "RESOLVED")}>
          {resolved ? <RotateCw /> : <Check />}
          <span className="hidden @lg:inline">{resolved ? "Reabrir" : "Resolver"}</span>
          <span className="sr-only @lg:hidden">{resolved ? "Reabrir" : "Resolver"}</span>
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant={sidePanelOpen ? "secondary" : "ghost"} size="icon-sm" aria-label={sidePanelOpen ? "Ocultar ficha del contacto" : "Ver ficha del contacto"} aria-pressed={sidePanelOpen} onClick={onToggleSidePanel} />
            }
          >
            <PanelRight />
          </TooltipTrigger>
          <TooltipPopup>{sidePanelOpen ? "Ocultar ficha" : "Ver ficha"}</TooltipPopup>
        </Tooltip>
      </div>
    </header>
  );
}
