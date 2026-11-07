"use client";

import { Tooltip } from "./tooltip";
import { displayName } from "@/lib/chats/display-name";
import { assignChatToMe, oneHourFromNow, resolveChat, setChatPriority, snoozeChat } from "@/lib/inbox/actions";
import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Command } from "cmdk";
import {
  Bot,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Contact,
  Flag,
  Loader2,
  Megaphone,
  MessageSquare,
  MessageSquareText,
  Plus,
  Search,
  Settings,
  UserCheck,
} from "lucide-react";
import type { NavGroup, NavItem } from "./app-shell";
import type { MessageSearchHit } from "@/lib/search/messages";
import { MESSAGE_SEARCH_MIN } from "@/lib/search/message-rules";
import { useToast } from "./toast";
import "./command-palette.css";

interface ChatHit {
  id: string;
  accountId: string;
  name: string | null;
  remoteJid: string;
  channel: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

interface ContactHit {
  id: string;
  accountId: string;
  name: string | null;
  remoteJid: string;
  channel: string;
  chat: { id: string } | null;
}

interface RecentItem {
  key: string;
  label: string;
  subtitle: string;
  href: string;
}

interface PaletteAction {
  id: string;
  label: string;
  icon: ElementType;
  run: () => Promise<void> | void;
  success?: string;
  /** Atajo de teclado equivalente (lib/inbox/shortcuts.ts), si existe. */
  keys?: string;
}

const CHAT_ENDPOINTS = [
  "/api/whatsapp/chats",
  "/api/telegram/chats",
  "/api/messenger/chats",
  "/api/instagram/chats",
  "/api/webchat/chats",
] as const;

const RECENT_KEY = "colibly:command-recent";

async function readItems<T>(result: PromiseSettledResult<Response>): Promise<T[]> {
  if (result.status !== "fulfilled" || !result.value.ok) return [];
  const data = await result.value.json().catch(() => null);
  return Array.isArray(data?.items) ? (data.items as T[]) : [];
}

function readRecent(): RecentItem[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecentItem =>
      item && typeof item.key === "string" && typeof item.label === "string" && typeof item.href === "string"
    ).slice(0, 6);
  } catch {
    return [];
  }
}

function rememberRecent(item: RecentItem) {
  try {
    const next = [item, ...readRecent().filter((entry) => entry.key !== item.key)].slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage no disponible: los recientes son un extra, no un requisito.
  }
}

function chatContext(pathname: string): { accountId: string; chatId: string } | null {
  const match = pathname.match(/^\/whatsapp\/chat\/([^/]+)\/([^/]+)/);
  return match ? { accountId: match[1], chatId: match[2] } : null;
}

export function CommandPalette({ nav }: { nav: (NavItem | NavGroup)[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState<ChatHit[]>([]);
  const [contacts, setContacts] = useState<ContactHit[]>([]);
  const [messageHits, setMessageHits] = useState<MessageSearchHit[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const router = useRouter();
  const pathname = usePathname();
  const inDemo = pathname.startsWith("/demo-componentes");
  const term = query.trim();
  const inChat = chatContext(pathname);

  useEffect(() => {
    if (inDemo) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [inDemo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga única desde localStorage al abrir
    if (open) setRecent(readRecent());
  }, [open]);

  // Búsqueda de contenido con debounce. Los endpoints ya están scoped por
  // cuenta/organización; si el rol no puede ver contactos (user), el 403 se
  // ignora y solo se muestran chats/secciones.
  useEffect(() => {
    if (inDemo || !open || term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const q = encodeURIComponent(term);
      const urls = [
        ...CHAT_ENDPOINTS.map((endpoint) => `${endpoint}?search=${q}&page=1&pageSize=4`),
        `/api/whatsapp/contacts?search=${q}&page=1&pageSize=5`,
        // Dentro de los mensajes: mínimo 3 caracteres (índice trigram).
        ...(term.length >= MESSAGE_SEARCH_MIN ? [`/api/whatsapp/search/messages?q=${q}`] : []),
      ];
      const results = await Promise.allSettled(urls.map((url) => fetch(url, { signal: controller.signal })));
      if (controller.signal.aborted) return;
      const chatItems = (
        await Promise.all(results.slice(0, CHAT_ENDPOINTS.length).map((result) => readItems<ChatHit>(result)))
      ).flat();
      const contactItems = await readItems<ContactHit>(results[CHAT_ENDPOINTS.length]);
      const messageResult = results[CHAT_ENDPOINTS.length + 1];
      const messageItems: MessageSearchHit[] =
        messageResult?.status === "fulfilled" && messageResult.value.ok
          ? ((await messageResult.value.json().catch(() => ({}))).results ?? [])
          : [];
      if (controller.signal.aborted) return;
      chatItems.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
      setChats(chatItems.slice(0, 8));
      setContacts(contactItems);
      setMessageHits(messageItems.slice(0, 6));
      setLoading(false);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [inDemo, open, term]);

  const pageGroups = useMemo(() => {
    const needle = term.toLowerCase();
    return nav
      .map((entry, index) => {
        const group = "items" in entry ? entry : { title: "Secciones", items: [entry] };
        return {
          title: group.title ?? `Sección ${index + 1}`,
          items: group.items.filter((item) => !needle || item.label.toLowerCase().includes(needle)),
        };
      })
      .filter((group) => group.items.length > 0);
  }, [nav, term]);

  const actions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [];

    if (inChat) {
      list.push(
        {
          id: "chat-assign-me",
          label: "Asignarme este chat",
          icon: UserCheck,
          success: "Chat asignado",
          keys: "Alt + A",
          run: async () => { await assignChatToMe(inChat.chatId); },
        },
        {
          id: "chat-resolve",
          label: "Resolver este chat",
          icon: CheckCircle2,
          success: "Chat resuelto",
          keys: "Alt + E",
          run: async () => { await resolveChat(inChat.chatId); },
        },
        {
          id: "chat-snooze",
          label: "Posponer este chat 1 hora",
          icon: Clock,
          success: "Chat pospuesto",
          keys: "Alt + S",
          run: async () => { await snoozeChat(inChat.chatId, oneHourFromNow()); },
        },
        {
          id: "chat-priority-high",
          label: "Marcar prioridad alta",
          icon: Flag,
          success: "Prioridad actualizada",
          run: async () => { await setChatPriority(inChat.chatId, "HIGH"); },
        },
      );
    }

    if (role === "admin" || role === "user") {
      list.push(
        { id: "create-campaign", label: "Nueva campaña", icon: Megaphone, run: () => router.push("/whatsapp/campanas/nueva") },
        { id: "create-template", label: "Nueva plantilla", icon: Plus, run: () => router.push("/whatsapp/plantillas/nueva") },
        { id: "create-automation", label: "Abrir automatizaciones", icon: Settings, run: () => router.push("/whatsapp/automatizaciones") },
      );
    }
    if (role === "admin") {
      list.push(
        { id: "create-bot", label: "Abrir bots IA", icon: Bot, run: () => router.push("/whatsapp/bots") },
        { id: "connect-whatsapp", label: "Conectar WhatsApp", icon: MessageSquare, run: () => router.push("/whatsapp/cuentas?nueva=1") },
        { id: "open-plan", label: "Ver plan y facturación", icon: Settings, run: () => router.push("/configuracion/plan") },
      );
    }
    list.push({ id: "create-appointment", label: "Abrir citas", icon: CalendarPlus, run: () => router.push("/whatsapp/citas") });

    return list;
  }, [inChat, role, router]);

  const visibleActions = useMemo(() => {
    if (!term) return actions;
    const needle = term.toLowerCase();
    return actions.filter((action) => action.label.toLowerCase().includes(needle));
  }, [actions, term]);

  if (inDemo) return null;

  function selectChat(chat: ChatHit) {
    rememberRecent({
      key: `chat:${chat.id}`,
      label: displayName(chat.name, chat.remoteJid),
      subtitle: chat.remoteJid,
      href: `/whatsapp/chat/${chat.accountId}/${chat.id}`,
    });
    setOpen(false);
    router.push(`/whatsapp/chat/${chat.accountId}/${chat.id}`);
  }

  function selectMessage(hit: MessageSearchHit) {
    setOpen(false);
    router.push(`/whatsapp/chat/${hit.accountId}/${hit.chatId}?mensaje=${encodeURIComponent(hit.messageId)}`);
  }

  function selectContact(contact: ContactHit) {
    const href = contact.chat?.id
      ? `/whatsapp/chat/${contact.accountId}/${contact.chat.id}`
      : `/whatsapp/contactos?search=${encodeURIComponent(contact.remoteJid)}`;
    rememberRecent({
      key: `contact:${contact.id}`,
      label: displayName(contact.name, contact.remoteJid),
      subtitle: contact.remoteJid,
      href,
    });
    setOpen(false);
    router.push(href);
  }

  async function runAction(action: PaletteAction) {
    setActionBusy(action.id);
    try {
      await action.run();
      setOpen(false);
      if (action.success) {
        toastSuccess(action.success);
        router.refresh();
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo completar la acción");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <>
      <Tooltip label="Buscar chats, contactos y secciones (Ctrl/⌘ K)"><button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar chats, contactos y secciones"
        className="colibly-command-trigger"
      >
        <Search size={17} />
        <span className="hidden xl:inline">Buscar chats, contactos…</span>
        <span className="hidden lg:inline xl:hidden">Buscar</span>
        <kbd className="hidden lg:inline">⌘ K</kbd>
      </button></Tooltip>
      <Command.Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        shouldFilter={false}
        label="Buscar en Colibly"
        contentClassName="colibly-command"
        overlayClassName="colibly-command-overlay"
      >
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Buscar chats, contactos, acciones o secciones…"
          aria-label="Buscar chats, contactos, acciones o secciones"
        />
        <Command.List>
          {loading && term.length >= 2 && (
            <div className="colibly-command-loading">
              <Loader2 size={14} className="animate-spin" /> Buscando…
            </div>
          )}
          {!term && recent.length > 0 && (
            <Command.Group heading="Recientes">
              {recent.map((item) => (
                <Command.Item
                  key={item.key}
                  value={`recent:${item.key}`}
                  onSelect={() => { setOpen(false); router.push(item.href); }}
                >
                  <Clock size={16} className="shrink-0 text-muted" />
                  <span className="colibly-command-result">
                    <span className="truncate">{item.label}</span>
                    <span className="colibly-command-meta">{item.subtitle}</span>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {visibleActions.length > 0 && (
            <Command.Group heading="Acciones">
              {visibleActions.map((action) => (
                <Command.Item
                  key={action.id}
                  value={`action:${action.id}`}
                  disabled={actionBusy !== null}
                  onSelect={() => void runAction(action)}
                >
                  {actionBusy === action.id
                    ? <Loader2 size={16} className="shrink-0 animate-spin text-muted" />
                    : <action.icon size={16} className="shrink-0 text-muted" />}
                  <span className="flex-1">{action.label}</span>
                  {action.keys && (
                    <kbd className="ml-auto shrink-0 rounded-md border border-border bg-surface-light px-1.5 py-0.5 text-[10px] font-medium text-muted-darker">
                      {action.keys}
                    </kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {!loading && term.length >= 2 && chats.length > 0 && (
            <Command.Group heading="Chats">
              {chats.map((chat) => (
                <Command.Item key={chat.id} value={`chat:${chat.id}`} onSelect={() => selectChat(chat)}>
                  <MessageSquare size={16} className="shrink-0 text-muted" />
                  <span className="colibly-command-result">
                    <span className="truncate">{displayName(chat.name, chat.remoteJid)}</span>
                    <span className="colibly-command-meta">{chat.remoteJid}</span>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {!loading && term.length >= 2 && contacts.length > 0 && (
            <Command.Group heading="Contactos">
              {contacts.map((contact) => (
                <Command.Item key={contact.id} value={`contact:${contact.id}`} onSelect={() => selectContact(contact)}>
                  <Contact size={16} className="shrink-0 text-muted" />
                  <span className="colibly-command-result">
                    <span className="truncate">{displayName(contact.name, contact.remoteJid)}</span>
                    <span className="colibly-command-meta">{contact.remoteJid}</span>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {!loading && term.length >= MESSAGE_SEARCH_MIN && messageHits.length > 0 && (
            <Command.Group heading="En mensajes">
              {messageHits.map((hit) => (
                <Command.Item key={hit.messageId} value={`message:${hit.messageId}`} onSelect={() => selectMessage(hit)}>
                  <MessageSquareText size={16} className="shrink-0 text-muted" />
                  <span className="colibly-command-result">
                    <span className="truncate">{hit.snippet}</span>
                    <span className="colibly-command-meta">{hit.chatName}</span>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {pageGroups.map((group) => (
            <Command.Group key={group.title} heading={group.title}>
              {group.items.map((item) => (
                <Command.Item
                  key={item.href}
                  value={`page:${item.href}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <item.icon size={16} className="shrink-0 text-muted" />
                  <span>{item.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
          {!loading && <Command.Empty>No hay resultados para “{term}”.</Command.Empty>}
        </Command.List>
        <div className="colibly-command-hint">↑ ↓ para navegar · Enter para abrir · Esc para cerrar</div>
      </Command.Dialog>
    </>
  );
}
