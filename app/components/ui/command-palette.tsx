"use client";

import { Tooltip } from "./tooltip";
import { displayName } from "@/lib/chats/display-name";
import { assignChatToMe, oneHourFromNow, resolveChat, setChatPriority, snoozeChat } from "@/lib/inbox/actions";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementType } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { CommandPalette as AxCommandPalette, CommandPaletteInput } from "@astryxdesign/core/CommandPalette";
import type { SearchSource, SearchableItem } from "@astryxdesign/core/Typeahead";
import { Kbd as AxKbd } from "@astryxdesign/core/Kbd";
import {
  Bot,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Contact,
  Flag,
  Megaphone,
  MessageSquare,
  MessageSquareText,
  Plus,
  Search,
  Zap,
  CreditCard,
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
  const { success: toastSuccess, error: toastError } = useToast();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const router = useRouter();
  const pathname = usePathname();
  const inChat = chatContext(pathname);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

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
        { id: "create-automation", label: "Abrir automatizaciones", icon: Zap, run: () => router.push("/whatsapp/automatizaciones") },
      );
    }
    if (role === "admin") {
      list.push(
        { id: "create-bot", label: "Abrir bots IA", icon: Bot, run: () => router.push("/whatsapp/bots") },
        { id: "connect-whatsapp", label: "Conectar WhatsApp", icon: MessageSquare, run: () => router.push("/whatsapp/cuentas?nueva=1") },
        { id: "open-plan", label: "Ver plan y facturación", icon: CreditCard, run: () => router.push("/configuracion/plan") },
      );
    }
    list.push({ id: "create-appointment", label: "Abrir citas", icon: CalendarPlus, run: () => router.push("/whatsapp/citas") });

    return list;
  }, [inChat, role, router]);

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
    try {
      await action.run();
      setOpen(false);
      if (action.success) {
        toastSuccess(action.success);
        router.refresh();
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo completar la acción");
    }
  }

  // Fuente de búsqueda de Astryx. Sin texto: recientes, acciones y secciones.
  // Con 2+ caracteres: además chats, contactos y (3+) mensajes, de los
  // endpoints de siempre (ya filtrados por cuenta/organización; un 403 para
  // el rol `user` en contactos se ignora). Espera 250 ms antes de pedir.
  const searchSource = useMemo<SearchSource<PaletteItem>>(() => {
    const pending: { controller: AbortController | null } = { controller: null };
    const local = (term: string): PaletteItem[] => {
      const needle = term.toLowerCase();
      const matches = (label: string) => !needle || label.toLowerCase().includes(needle);
      const items: PaletteItem[] = [];
      if (!term) {
        for (const item of readRecent()) {
          items.push(paletteItem(`recent:${item.key}`, item.label, "Recientes", Clock, () => router.push(item.href), item.subtitle));
        }
      }
      for (const action of actions) {
        if (matches(action.label)) {
          items.push(paletteItem(`action:${action.id}`, action.label, "Acciones", action.icon, () => void runAction(action), undefined, action.keys));
        }
      }
      nav.forEach((entry) => {
        const group = "items" in entry ? entry : { title: "Secciones", items: [entry] };
        for (const item of group.items) {
          if (matches(item.label)) {
            items.push(paletteItem(`page:${item.href}`, item.label, group.title ?? "Secciones", item.icon, () => router.push(item.href)));
          }
        }
      });
      return items;
    };
    return {
      bootstrap: () => local(""),
      cancel: () => pending.controller?.abort(),
      search: async (query: string) => {
        const term = query.trim();
        const pages = local(term);
        if (term.length < 2) return pages;
        pending.controller?.abort();
        const own = new AbortController();
        pending.controller = own;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        if (own.signal.aborted) return pages;
        const q = encodeURIComponent(term);
        const urls = [
          ...CHAT_ENDPOINTS.map((endpoint) => `${endpoint}?search=${q}&page=1&pageSize=4`),
          `/api/whatsapp/contacts?search=${q}&page=1&pageSize=5`,
          // Dentro de los mensajes: mínimo 3 caracteres (índice trigram).
          ...(term.length >= MESSAGE_SEARCH_MIN ? [`/api/whatsapp/search/messages?q=${q}`] : []),
        ];
        const results = await Promise.allSettled(urls.map((url) => fetch(url, { signal: own.signal })));
        const chats = (
          await Promise.all(results.slice(0, CHAT_ENDPOINTS.length).map((result) => readItems<ChatHit>(result)))
        ).flat();
        const contacts = await readItems<ContactHit>(results[CHAT_ENDPOINTS.length]);
        const messageResult = results[CHAT_ENDPOINTS.length + 1];
        const messages: MessageSearchHit[] =
          messageResult?.status === "fulfilled" && messageResult.value.ok
            ? ((await messageResult.value.json().catch(() => ({}))).results ?? [])
            : [];
        chats.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
        const actionsFirst = pages.filter((item) => item.auxiliaryData?.group === "Acciones");
        const sections = pages.filter((item) => item.auxiliaryData?.group !== "Acciones");
        return [
          ...actionsFirst,
          ...chats.slice(0, 8).map((chat) =>
            paletteItem(`chat:${chat.id}`, displayName(chat.name, chat.remoteJid), "Chats", MessageSquare, () => selectChat(chat), chat.remoteJid)
          ),
          ...contacts.map((contact) =>
            paletteItem(`contact:${contact.id}`, displayName(contact.name, contact.remoteJid), "Contactos", Contact, () => selectContact(contact), contact.remoteJid)
          ),
          ...messages.slice(0, 6).map((hit) =>
            paletteItem(`message:${hit.messageId}`, hit.snippet, "En mensajes", MessageSquareText, () => selectMessage(hit), hit.chatName)
          ),
          ...sections,
        ];
      },
    };
    // runAction/selectX solo usan router y toasts, estables entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, nav, router]);

  // Cada resultado guarda qué hacer al elegirlo; Astryx avisa con su id.
  const byId = useRef(new Map<string, PaletteItem>());

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
      <AxCommandPalette<PaletteItem>
        isOpen={open}
        onOpenChange={setOpen}
        label="Buscar en Colibly"
        searchSource={{
          ...searchSource,
          bootstrap: () => remember(byId.current, searchSource.bootstrap() as PaletteItem[]),
          search: async (query: string) => remember(byId.current, await searchSource.search(query)),
        }}
        onValueChange={(id) => byId.current.get(id)?.auxiliaryData?.select()}
        input={<CommandPaletteInput placeholder="Buscar chats, contactos, acciones o secciones…" label="Buscar chats, contactos, acciones o secciones" />}
        emptySearchText="No hay resultados."
        emptyBootstrapText="Escribe para buscar."
        renderItem={(item) => {
          const data = item.auxiliaryData;
          const Icon = data?.icon ?? Search;
          return (
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <Icon size={16} className="shrink-0 text-muted" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{item.label}</span>
                {data?.meta && <span className="truncate text-xs text-muted-darker">{data.meta}</span>}
              </span>
              {data?.keys && <Kbd keys={data.keys} />}
            </span>
          );
        }}
      />
    </>
  );
}

interface PaletteItemData {
  group: string;
  icon: ElementType;
  meta?: string;
  keys?: string;
  select: () => void;
}
type PaletteItem = SearchableItem<PaletteItemData>;

function paletteItem(id: string, label: string, group: string, icon: ElementType, select: () => void, meta?: string, keys?: string): PaletteItem {
  return { id, label, auxiliaryData: { group, icon, select, meta, keys } };
}

function remember(map: Map<string, PaletteItem>, items: PaletteItem[]): PaletteItem[] {
  for (const item of items) map.set(item.id, item);
  return items;
}

/** Atajo ("Alt + A") con el Kbd de Astryx. */
function Kbd({ keys }: { keys: string }) {
  return <AxKbd keys={keys.replace(/\s*\+\s*/g, "+").toLowerCase()} />;
}
