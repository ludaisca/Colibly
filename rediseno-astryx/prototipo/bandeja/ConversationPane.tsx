'use client';

import {Fragment, useState, type CSSProperties} from 'react';
import {VStack, HStack, StackItem} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {
  ChatLayout,
  ChatMessageList,
  ChatMessage,
  ChatMessageBubble,
  ChatSystemMessage,
  ChatComposer,
} from '@astryxdesign/core/Chat';
import {ArrowLeftIcon} from '@heroicons/react/24/outline';
import {CHANNEL_LABEL, LEAD_STATUS_LABEL, type ChatItem, type Message} from '@/lib/inbox/types';
import {serviceWindowFrom} from '@/lib/inbox/service-window';
import {dayKey, dayLabel, formatTime} from './format';

const paneStyle: CSSProperties = {height: '100%', minHeight: 0};
const fillStyle: CSSProperties = {height: '100%'};
const headerStyle: CSSProperties = {borderBlockEnd: '1px solid var(--color-border)'};

const SENT_VIA_LABEL = {agent: null, bot: 'Bot', campaign: 'Campaña'} as const;

/** "Cierra en 3 h" / "Cierra en 25 min" para la ventana de 24 h. */
function closesIn(expiresAt: string, now: Date): string {
  const min = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 60_000));
  return min >= 60 ? `La ventana de 24 h cierra en ${Math.floor(min / 60)} h` : `La ventana de 24 h cierra en ${min} min`;
}

export function ConversationPane({
  chat,
  messages,
  now,
  onBack,
  onSend,
  onAssignToMe,
}: {
  chat: ChatItem;
  messages: Message[];
  now: Date;
  /** Solo en celular: volver a la lista. */
  onBack?: () => void;
  onSend: (body: string) => void;
  onAssignToMe: () => void;
}) {
  const [draft, setDraft] = useState('');

  // La ventana de 24 h solo aplica a WhatsApp (API oficial de Meta).
  const lastInbound = messages.findLast((m) => m.direction === 'INBOUND');
  const serviceWindow = serviceWindowFrom(lastInbound ? new Date(lastInbound.timestamp) : null, now);
  const isWindowClosed = chat.channel === 'WHATSAPP' && !serviceWindow.open;

  const submit = (value: string) => {
    const body = value.trim();
    if (!body) return;
    onSend(body);
    setDraft('');
  };

  return (
    <VStack gap={0} style={paneStyle}>
      <HStack gap={2} vAlign="center" paddingInline={3} paddingBlock={2} style={headerStyle}>
        {onBack && (
          <IconButton
            label="Volver a chats"
            variant="ghost"
            size="sm"
            icon={<Icon icon={ArrowLeftIcon} />}
            onClick={onBack}
          />
        )}
        <Avatar name={chat.name} size="sm" tooltip={false} />
        <StackItem size="fill">
          <VStack gap={0}>
            <Text type="body" weight="semibold" maxLines={1}>
              {chat.name}
            </Text>
            <Text type="supporting" color="secondary" maxLines={1}>
              {CHANNEL_LABEL[chat.channel]} · {chat.accountName}
            </Text>
          </VStack>
        </StackItem>
        <Badge variant={chat.leadStatus === 'CUSTOMER' ? 'success' : 'neutral'} label={LEAD_STATUS_LABEL[chat.leadStatus]} />
      </HStack>

      <StackItem size="fill" style={{minHeight: 0}}>
        <ChatLayout
          // Sin altura explícita, ChatLayout crece con los mensajes y empuja el
          // compositor fuera de la pantalla en lugar de desplazar la lista.
          style={fillStyle}
          density="compact"
          composer={
            <VStack gap={2}>
              {!chat.assignedTo && chat.status !== 'RESOLVED' && (
                <HStack gap={2} vAlign="center">
                  <StackItem size="fill">
                    <Text type="supporting" color="secondary">
                      Nadie atiende este chat
                    </Text>
                  </StackItem>
                  <Button label="Asignarme" size="sm" onClick={onAssignToMe} />
                </HStack>
              )}
              <ChatComposer
                density="compact"
                placeholder={isWindowClosed ? 'Solo puedes enviar una plantilla' : 'Escribe un mensaje'}
                value={draft}
                onChange={setDraft}
                onSubmit={submit}
                isDisabled={isWindowClosed}
                status={
                  isWindowClosed
                    ? {
                        type: 'warning',
                        message: 'Pasaron más de 24 h desde el último mensaje del cliente. Para escribirle, usa una plantilla aprobada por Meta.',
                      }
                    : undefined
                }
                headerContext={
                  chat.channel === 'WHATSAPP' && serviceWindow.open && serviceWindow.expiresAt ? (
                    <Text type="supporting" color="secondary">
                      {closesIn(serviceWindow.expiresAt, now)}
                    </Text>
                  ) : undefined
                }
              />
            </VStack>
          }>
          <ChatMessageList density="compact">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const isNewDay = !prev || dayKey(prev.timestamp) !== dayKey(m.timestamp);
              const isOut = m.direction === 'OUTBOUND';
              // Un "grupo" = mensajes seguidos del mismo remitente el mismo día:
              // el nombre va solo en el primero, como en WhatsApp.
              const sameGroup = (o?: Message) =>
                !!o &&
                o.direction === m.direction &&
                o.senderName === m.senderName &&
                dayKey(o.timestamp) === dayKey(m.timestamp);
              const startsGroup = !sameGroup(prev);
              const endsGroup = !sameGroup(next);
              const group = startsGroup && endsGroup ? undefined : startsGroup ? 'first' : endsGroup ? 'last' : 'middle';
              const via = isOut && m.sentVia ? SENT_VIA_LABEL[m.sentVia] : null;
              return (
                <Fragment key={m.id}>
                  {isNewDay && (
                    <ChatSystemMessage variant="divider">{dayLabel(m.timestamp, now)}</ChatSystemMessage>
                  )}
                  {/* Afuera (user) = tu equipo, a la derecha; adentro (assistant) = el cliente. */}
                  <ChatMessage
                    sender={isOut ? 'user' : 'assistant'}
                    avatar={null}
                    name={startsGroup ? (isOut ? (via ?? m.senderName ?? 'Tú') : chat.name) : null}>
                    <ChatMessageBubble
                      group={group}
                      metadata={
                        <Text type="supporting" color="secondary" size="xsm" hasTabularNumbers>
                          {formatTime(m.timestamp)}
                          {isOut && m.status === 'read' ? ' · Leído' : ''}
                        </Text>
                      }>
                      {m.body}
                    </ChatMessageBubble>
                  </ChatMessage>
                </Fragment>
              );
            })}
          </ChatMessageList>
        </ChatLayout>
      </StackItem>
    </VStack>
  );
}
