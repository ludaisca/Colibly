'use client';

import {VStack, HStack, StackItem} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {List, ListItem} from '@astryxdesign/core/List';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {TextInput} from '@astryxdesign/core/TextInput';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {MoonIcon, SunIcon} from '@heroicons/react/24/outline';
import {CHANNEL_LABEL, type ChatItem} from '@/lib/inbox/types';
import {rowSignal} from '@/lib/inbox/row-signal';
import {waitingClock, waitingSpoken, waitingTone} from '@/lib/inbox/waiting';
import {useColorMode} from '@/components/ColorMode';
import {listTime} from './format';

export type ListFilter = 'awaiting' | 'all';

const TONE_DOT = {muted: 'neutral', warning: 'warning', danger: 'error'} as const;

function RowEnd({chat, now}: {chat: ChatItem; now: Date}) {
  const signal = rowSignal(chat, now);
  switch (signal.kind) {
    case 'waiting':
      // La "lámpara" de Andén: punto ámbar/rojo + cifra de espera.
      return (
        <HStack gap={1.5} vAlign="center">
          <StatusDot
            variant={TONE_DOT[waitingTone(signal.minutes)]}
            label={waitingSpoken(signal.minutes)}
          />
          <Text type="label" hasTabularNumbers aria-hidden>
            {waitingClock(signal.minutes)}
          </Text>
        </HStack>
      );
    case 'unread':
      return <Badge variant="teal" label={String(signal.count)} />;
    case 'urgent':
      return <Badge variant="error" label="Urgente" />;
    case 'time':
      return (
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {listTime(chat.lastMessageAt, now)}
        </Text>
      );
  }
}

export function ChatListPane({
  chats,
  now,
  selectedId,
  filter,
  awaitingCount,
  search,
  onFilterChange,
  onSearchChange,
  onOpen,
}: {
  chats: ChatItem[];
  now: Date;
  selectedId: string | null;
  filter: ListFilter;
  awaitingCount: number;
  search: string;
  onFilterChange: (f: ListFilter) => void;
  onSearchChange: (s: string) => void;
  onOpen: (id: string) => void;
}) {
  const {mode, toggle} = useColorMode();

  return (
    <VStack gap={3} padding={3}>
      <HStack gap={2} vAlign="center">
        <StackItem size="fill">
          <Heading level={1}>Chats</Heading>
        </StackItem>
        <IconButton
          label={mode === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'}
          variant="ghost"
          size="sm"
          icon={<Icon icon={mode === 'dark' ? SunIcon : MoonIcon} />}
          onClick={toggle}
        />
      </HStack>

      <SegmentedControl
        label="Qué chats mostrar"
        value={filter}
        onChange={(v) => onFilterChange(v as ListFilter)}
        layout="fill"
        size="sm">
        <SegmentedControlItem value="awaiting" label={`Esperando ${awaitingCount}`} />
        <SegmentedControlItem value="all" label="Todos" />
      </SegmentedControl>

      <TextInput
        label="Buscar chats"
        isLabelHidden
        type="search"
        startIcon="search"
        placeholder="Buscar por nombre o mensaje"
        value={search}
        onChange={onSearchChange}
        hasClear
        size="sm"
      />

      {chats.length === 0 ? (
        <EmptyState
          isCompact
          title={filter === 'awaiting' ? 'Nadie espera respuesta' : 'Sin resultados'}
          description={filter === 'awaiting' ? 'Estás al día.' : undefined}
        />
      ) : (
        <List edge="outset" density="compact">
          {chats.map((chat) => (
            <ListItem
              key={chat.id}
              itemKey={chat.id}
              isSelected={chat.id === selectedId}
              onClick={() => onOpen(chat.id)}
              startContent={<Avatar name={chat.name} size="md" tooltip={false} />}
              label={
                <Text type="body" weight={chat.unreadCount > 0 ? 'semibold' : 'medium'} maxLines={1}>
                  {chat.name}
                </Text>
              }
              description={
                <VStack gap={0}>
                  <Text type="supporting" color="secondary" maxLines={1}>
                    {chat.lastMessage}
                  </Text>
                  <Text type="supporting" color="secondary" size="xsm" maxLines={1}>
                    {CHANNEL_LABEL[chat.channel]} · {chat.accountName}
                    {chat.assignedTo ? ` · ${chat.assignedTo}` : ' · Sin asignar'}
                  </Text>
                </VStack>
              }
              endContent={<RowEnd chat={chat} now={now} />}
            />
          ))}
        </List>
      )}
    </VStack>
  );
}
