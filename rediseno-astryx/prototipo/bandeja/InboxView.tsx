'use client';

import {useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties} from 'react';
import {Layout, LayoutPanel} from '@astryxdesign/core/Layout';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import type {ChatItem, Message} from '@/lib/inbox/types';
import {chatRowComparator} from '@/lib/inbox/sort';
import {ChatListPane, type ListFilter} from './ChatListPane';
import {ConversationPane} from './ConversationPane';

const WIDE_QUERY = '(min-width: 768px)';
const fullStyle: CSSProperties = {height: '100%', backgroundColor: 'var(--color-background-body)'};

/** ¿Pantalla ancha? En el servidor se asume celular (la superficie principal). */
function useIsWide() {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(WIDE_QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

const chatFromUrl = () => new URLSearchParams(location.search).get('chat');

export function InboxView({
  now: initialNow,
  userName,
  initialChats,
  initialMessages,
}: {
  now: string;
  userName: string;
  initialChats: ChatItem[];
  initialMessages: Message[];
}) {
  const isWide = useIsWide();
  const [chats, setChats] = useState(initialChats);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>('awaiting');
  const [search, setSearch] = useState('');
  // Reloj de la bandeja: arranca con la hora del servidor (misma hidratación)
  // y avanza cada 30 s para que las esperas suban solas.
  const [now, setNow] = useState(() => new Date(initialNow));

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Abrir/cerrar un chat no navega (patrón de Colibly): pushState + popstate,
  // así el botón Atrás del celular regresa a la lista sin recargar nada.
  useEffect(() => {
    const sync = () => setSelectedId(chatFromUrl());
    sync();
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);

  const openChat = (id: string) => {
    history.pushState(null, '', `?chat=${id}`);
    setSelectedId(id);
    setChats((cs) => cs.map((c) => (c.id === id ? {...c, unreadCount: 0} : c)));
  };
  const closeChat = () => history.back();

  const isAwaiting = (c: ChatItem) => c.waitingSince !== null && c.status !== 'RESOLVED';
  const awaitingCount = chats.filter(isAwaiting).length;

  const visibleChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chats
      .filter((c) => filter === 'all' || isAwaiting(c))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q))
      .sort(chatRowComparator({awaiting: filter === 'awaiting'}));
  }, [chats, filter, search]);

  const selected = chats.find((c) => c.id === selectedId) ?? null;
  const thread = messages.filter((m) => m.chatId === selectedId);

  const send = (body: string) => {
    if (!selected) return;
    const ts = new Date().toISOString();
    setMessages((ms) => [
      ...ms,
      {
        id: `local-${ts}`,
        chatId: selected.id,
        direction: 'OUTBOUND',
        body,
        timestamp: ts,
        sentVia: 'agent',
        senderName: userName,
        status: 'sent',
      },
    ]);
    // Una respuesta real limpia la espera (markWaiting/clearWaiting en Colibly).
    setChats((cs) =>
      cs.map((c) =>
        c.id === selected.id ? {...c, lastMessage: body, lastMessageAt: ts, waitingSince: null} : c,
      ),
    );
  };

  const assignToMe = () =>
    selected && setChats((cs) => cs.map((c) => (c.id === selected.id ? {...c, assignedTo: userName} : c)));

  const list = (
    <ChatListPane
      chats={visibleChats}
      now={now}
      selectedId={selectedId}
      filter={filter}
      awaitingCount={awaitingCount}
      search={search}
      onFilterChange={setFilter}
      onSearchChange={setSearch}
      onOpen={openChat}
    />
  );

  const conversation = selected ? (
    <ConversationPane
      key={selected.id}
      chat={selected}
      messages={thread}
      now={now}
      onBack={isWide ? undefined : closeChat}
      onSend={send}
      onAssignToMe={assignToMe}
    />
  ) : null;

  // Celular: una sola superficie a la vez (lista o conversación).
  if (!isWide) {
    return (
      <main style={fullStyle}>
        {conversation ?? list}
      </main>
    );
  }

  // Escritorio: lista a la izquierda y conversación a la derecha.
  return (
    <main style={fullStyle}>
      <Layout
        height="fill"
        start={
          <LayoutPanel width={380} hasDivider label="Lista de chats">
            {list}
          </LayoutPanel>
        }
        content={
          conversation ?? (
            <EmptyState title="Elige un chat" description="Los que esperan respuesta van primero." />
          )
        }
      />
    </main>
  );
}
