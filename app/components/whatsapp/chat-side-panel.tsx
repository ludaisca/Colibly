"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/app/components/kit/tabs";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/app/components/kit/select";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/app/components/kit/empty";
import { ContactPanel } from "@/app/components/crm/contact-panel";
import { Timeline } from "@/app/components/crm/timeline";
import { ChatTagPicker } from "./chat-tag-picker";
import { LeadScoreBadge } from "./lead-score-badge";
import { ChatCostBadge } from "./chat-cost-badge";
import { AutomationChip } from "./automation-chip";
import { STATUS_BADGE, type ChatItem, type ChatStatus } from "./chat-shared";

// Columna derecha de la bandeja: quién es (ficha), cómo va la conversación
// (estado, etiquetas, calificación, consumo de IA, automatizaciones) y su
// actividad. En pantallas angostas se abre como cajón con la sola ficha.

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
      {children}
    </section>
  );
}

export function ChatSidePanel({
  chat,
  onStatusChange,
  onUpdated,
}: {
  chat: ChatItem;
  onStatusChange: (status: ChatStatus) => void | Promise<void>;
  onUpdated: () => void;
}) {
  const [personId, setPersonId] = useState<string | null>(null);
  const hasContact = !!chat.contactId;
  const [tab, setTab] = useState<string>(hasContact ? "contact" : "conversation");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="min-h-0 flex-1 gap-0">
      <div className="shrink-0 border-b px-3 py-2.5">
        <TabsList className="w-full">
          {hasContact && <TabsTab value="contact" className="text-xs">Contacto</TabsTab>}
          <TabsTab value="conversation" className="text-xs">Conversación</TabsTab>
          {hasContact && <TabsTab value="activity" className="text-xs">Actividad</TabsTab>}
        </TabsList>
      </div>

      {hasContact && (
        <TabsPanel value="contact" keepMounted className="scrollbar-thin min-h-0 overflow-y-auto data-[hidden]:hidden">
          <ContactPanel key={chat.contactId} contactId={chat.contactId!} onUpdated={onUpdated} onLoaded={(c) => setPersonId(c.personId)} activitySlot />
        </TabsPanel>
      )}

      <TabsPanel value="conversation" className="scrollbar-thin min-h-0 overflow-y-auto">
        <div className="space-y-6 p-4">
          <Field label="Estado">
            <Select value={chat.status} onValueChange={(v) => v && onStatusChange(v as ChatStatus)}>
              <SelectTrigger aria-label="Estado de la conversación"><SelectValue>{STATUS_BADGE[chat.status].label}</SelectValue></SelectTrigger>
              <SelectPopup>
                {(Object.keys(STATUS_BADGE) as ChatStatus[]).map((status) => <SelectItem key={status} value={status}>{STATUS_BADGE[status].label}</SelectItem>)}
              </SelectPopup>
            </Select>
          </Field>
          <Field label="Etiquetas de la conversación"><ChatTagPicker chatId={chat.id} /></Field>
          {(chat.channel === "WHATSAPP" || chat.channel === "TELEGRAM") && <Field label="Calificación del lead"><LeadScoreBadge chatId={chat.id} /></Field>}
          <Field label="Consumo de IA"><ChatCostBadge chatId={chat.id} showEmpty /></Field>
          <Field label="Automatizaciones"><AutomationChip chatId={chat.id} showEmpty /></Field>
        </div>
      </TabsPanel>

      {hasContact && (
        <TabsPanel value="activity" className="scrollbar-thin min-h-0 overflow-y-auto">
          <div className="p-4">
            {personId ? (
              <Timeline personId={personId} compact />
            ) : (
              <Empty className="py-8"><EmptyHeader><EmptyTitle>Cargando actividad</EmptyTitle><EmptyDescription>Un momento…</EmptyDescription></EmptyHeader></Empty>
            )}
          </div>
        </TabsPanel>
      )}
    </Tabs>
  );
}
