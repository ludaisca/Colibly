"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Contact, Loader2, MessageSquare, Search } from "lucide-react";
import type { NavGroup, NavItem } from "./app-shell";
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

const CHAT_ENDPOINTS = [
  "/api/whatsapp/chats",
  "/api/telegram/chats",
  "/api/messenger/chats",
  "/api/instagram/chats",
  "/api/webchat/chats",
] as const;

async function readItems<T>(result: PromiseSettledResult<Response>): Promise<T[]> {
  if (result.status !== "fulfilled" || !result.value.ok) return [];
  const data = await result.value.json().catch(() => null);
  return Array.isArray(data?.items) ? (data.items as T[]) : [];
}

export function CommandPalette({ nav }: { nav: (NavItem | NavGroup)[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState<ChatHit[]>([]);
  const [contacts, setContacts] = useState<ContactHit[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const inDemo = pathname.startsWith("/demo-componentes");
  const term = query.trim();

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
      ];
      const results = await Promise.allSettled(urls.map((url) => fetch(url, { signal: controller.signal })));
      if (controller.signal.aborted) return;
      const chatItems = (
        await Promise.all(results.slice(0, CHAT_ENDPOINTS.length).map((result) => readItems<ChatHit>(result)))
      ).flat();
      const contactItems = await readItems<ContactHit>(results[CHAT_ENDPOINTS.length]);
      if (controller.signal.aborted) return;
      chatItems.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
      setChats(chatItems.slice(0, 8));
      setContacts(contactItems);
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

  if (inDemo) return null;

  function selectChat(chat: ChatHit) {
    setOpen(false);
    router.push(`/whatsapp/chat/${chat.accountId}/${chat.id}`);
  }

  function selectContact(contact: ContactHit) {
    setOpen(false);
    if (contact.chat?.id) {
      router.push(`/whatsapp/chat/${contact.accountId}/${contact.chat.id}`);
    } else {
      router.push(`/whatsapp/contactos?search=${encodeURIComponent(contact.remoteJid)}`);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar chats, contactos y secciones"
        title="Buscar chats, contactos y secciones (Ctrl/⌘ K)"
        className="colibly-command-trigger"
      >
        <Search size={17} />
        <span className="hidden xl:inline">Buscar chats, contactos…</span>
        <span className="hidden lg:inline xl:hidden">Buscar</span>
        <kbd className="hidden lg:inline">⌘ K</kbd>
      </button>
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
          placeholder="Buscar chats, contactos o secciones…"
          aria-label="Buscar chats, contactos o secciones"
        />
        <Command.List>
          {loading && term.length >= 2 && (
            <div className="colibly-command-loading">
              <Loader2 size={14} className="animate-spin" /> Buscando…
            </div>
          )}
          {!loading && term.length >= 2 && chats.length > 0 && (
            <Command.Group heading="Chats">
              {chats.map((chat) => (
                <Command.Item key={chat.id} value={`chat:${chat.id}`} onSelect={() => selectChat(chat)}>
                  <MessageSquare size={16} className="shrink-0 text-muted" />
                  <span className="colibly-command-result">
                    <span className="truncate">{chat.name ?? chat.remoteJid}</span>
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
                    <span className="truncate">{contact.name ?? contact.remoteJid}</span>
                    <span className="colibly-command-meta">{contact.remoteJid}</span>
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
