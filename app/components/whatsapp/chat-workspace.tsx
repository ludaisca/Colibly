"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useRouter, usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/app/components/kit/empty";
import { Spinner } from "@/app/components/kit/spinner";
import { useToast } from "@/app/components/ui/toast";
import { ContactDrawer } from "@/app/components/whatsapp/contact-drawer";
import { ChatSidePanel } from "@/app/components/whatsapp/chat-side-panel";
import { ChatAccountRail } from "@/app/components/whatsapp/chat-account-rail";
import { ChatListPanel } from "@/app/components/whatsapp/chat-list-panel";
import { ChatThreadPanel, MediaPreviewModal } from "@/app/components/whatsapp/chat-thread-panel";
import { ChatComposer } from "@/app/components/whatsapp/chat-composer";
import { isImageMime, isAudioMime, isVideoMime } from "@/lib/whatsapp/media-shared";
import {
  CHATS_PAGE_SIZE,
  CHATS_LIST_POLL_MS,
  type Channel,
  type ChatItem,
  type ChatStatus,
  type ChatView,
  type Message,
  type PreviewMedia,
  type CannedResponseItem,
  type CampaignOption,
  type AccountOption,
} from "@/app/components/whatsapp/chat-shared";

// Orquestador del inbox de chat: dueño de todo el estado (chats, mensajes,
// filtros, polling, envío optimista) y de la composición de los 4 paneles en
// los que se dividió (rail de cuentas, lista, hilo, composer) — la vista de
// 3 columnas viene de montar rail + lista + hilo lado a lado. Ver
// chat-shared.ts para los tipos/constantes compartidos.

// Endpoint de subida de media saliente por canal — estático, no depende de
// props/estado, así que vive a nivel de módulo en vez de recrearse en cada
// render.
const MEDIA_UPLOAD_ENDPOINT: Record<Channel, string> = {
  WHATSAPP: "/api/whatsapp/media",
  TELEGRAM: "/api/telegram/media",
  MESSENGER: "/api/messenger/media",
  INSTAGRAM: "/api/instagram/media",
  // Nunca se invoca en la práctica — el botón de adjuntar está deshabilitado
  // para WEBCHAT (attachmentsDisabled más abajo, roadmap P3-f es MVP solo
  // texto). Entrada presente solo para satisfacer Record<Channel, string>.
  WEBCHAT: "/api/webchat/media-not-supported",
};

interface ChatWorkspaceProps {
  initialAccounts: AccountOption[];
  /** Cuenta de la URL /chat/<cuenta>/<chat>: solo sirve para recuperar un chat que no está en la primera página. */
  routeAccountId?: string;
  /** Filtro de cuenta (?accountId=). */
  initialAccountId?: string;
  initialChatId?: string;
  initialCampaignId?: string;
  initialHasReplied?: "" | "yes" | "no";
  initialSearch?: string;
  initialView?: ChatView;
  initialStatus?: StatusFilter;
}

// "" = abiertos y pendientes (lo que hay que atender); con una búsqueda activa
// se incluyen también los resueltos para poder encontrar cualquier chat.
export type StatusFilter = "" | "RESOLVED" | "ALL";
const SIDE_PANEL_KEY = "colibly_inbox_side_panel";

// La conversación abierta no desaparece cuando un filtro o vista deja de
// incluirla (al resolverla, al leerla en "sin leer", al cambiar de vista).
function keepOpenChat(prev: ChatItem[], items: ChatItem[], openId: string | null): ChatItem[] {
  const open = openId ? prev.find((c) => c.id === openId) : undefined;
  return open && !items.some((c) => c.id === open.id) ? [...items, open] : items;
}

export function ChatWorkspace({
  initialAccounts,
  routeAccountId,
  initialAccountId,
  initialChatId,
  initialCampaignId,
  initialHasReplied,
  initialSearch,
  initialView,
  initialStatus,
}: ChatWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { error: toastError } = useToast();
  const resizable = useSyncExternalStore(
    (onChange) => { const query = window.matchMedia("(min-width: 1024px)"); query.addEventListener("change", onChange); return () => query.removeEventListener("change", onChange); },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false
  );

  const wide = useSyncExternalStore(
    (onChange) => { const query = window.matchMedia("(min-width: 1280px)"); query.addEventListener("change", onChange); return () => query.removeEventListener("change", onChange); },
    () => window.matchMedia("(min-width: 1280px)").matches,
    () => false
  );
  // La ficha fija a la derecha recuerda si el usuario la ocultó.
  const [sidePanelPref, setSidePanelPref] = useState<boolean>(() => {
    try { return window.localStorage.getItem(SIDE_PANEL_KEY) !== "0"; } catch { return true; }
  });

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [missingChat, setMissingChat] = useState(false);
  const [loadingMoreChats, setLoadingMoreChats] = useState(false);
  const [chatsTotal, setChatsTotal] = useState(0);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState(initialSearch || "");
  // La búsqueda va al servidor (la lista está paginada — filtrar solo lo
  // cargado escondía chats antiguos); el debounce evita un fetch por tecla.
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch || "");
  const [accountFilter, setAccountFilter] = useState(initialAccountId || "");
  const [campaignFilter, setCampaignFilter] = useState(initialCampaignId || "");
  const [hasRepliedFilter, setHasRepliedFilter] = useState<"" | "yes" | "no">(initialHasReplied || "");
  const [view, setView] = useState<ChatView>(initialView || "all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus || "");
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const accounts = initialAccounts;
  // Las cuentas llegan del servidor: un filtro de cuenta ya conoce su canal
  // antes de pedir chats y no consulta los otros cuatro endpoints por error.
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null);
  const [cannedResponses, setCannedResponses] = useState<CannedResponseItem[]>([]);
  // Sugerencia de respuesta rápida resaltada — navegable con ↑/↓, se inserta
  // con Enter o Tab.
  const [cannedIndex, setCannedIndex] = useState(0);

  // Media attachments state
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  // Botones de respuesta rápida en construcción para el próximo envío (solo
  // WhatsApp Meta — ver "Mensajes interactivos" en AGENTS.md).
  const [interactiveButtons, setInteractiveButtons] = useState<string[]>([]);
  const [buttonsPanelOpen, setButtonsPanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageDraftsRef = useRef<Map<string, string>>(new Map());
  const activeChatIdRef = useRef(selectedChatId);
  useEffect(() => { activeChatIdRef.current = selectedChatId; }, [selectedChatId]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // scrollHeight previo a un prepend de historial — permite restaurar la
  // posición de lectura en vez de que el contenido "salte" hacia abajo.
  const prependHeightRef = useRef<number | null>(null);
  // Payload original de cada mensaje optimista, por tempId — permite
  // reintentar un envío fallido sin pedirle al usuario que lo reescriba.
  const pendingSendsRef = useRef<Map<string, { text: string; file: File | null; filePreviewUrl: string | null; buttons: string[]; replyTo: Message | null }>>(new Map());
  // Se incrementa cada vez que la lista se recarga desde cero (cambio de
  // filtros): un refresco periódico que salió antes descarta su resultado.
  const chatsGenerationRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Una fuente por canal — recorrida con .map() en vez de variables nombradas
  // por canal (el patrón viejo, waPage/tgPage, no escalaba a 4 canales). Solo
  // WhatsApp soporta el filtro de campaña (campaignId), por eso el builder de
  // params lo agrega condicionalmente en vez de vivir en una lista aparte.
  const CHANNEL_SOURCES = useMemo(() => [
    { channel: "WHATSAPP" as const, endpoint: "/api/whatsapp/chats" },
    { channel: "TELEGRAM" as const, endpoint: "/api/telegram/chats" },
    { channel: "MESSENGER" as const, endpoint: "/api/messenger/chats" },
    { channel: "INSTAGRAM" as const, endpoint: "/api/instagram/chats" },
    { channel: "WEBCHAT" as const, endpoint: "/api/webchat/chats" },
  ], []);

  const buildChannelParams = useCallback((channel: (typeof CHANNEL_SOURCES)[number]["channel"], page: number, pageSize: number): URLSearchParams => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (channel === "WHATSAPP" && campaignFilter) params.set("campaignId", campaignFilter);
    if (hasRepliedFilter) params.set("hasReplied", hasRepliedFilter);
    if (accountFilter) params.set("accountId", accountFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (view === "mine") params.set("assigned", "me");
    if (view === "unassigned") params.set("assigned", "none");
    if (view === "unread") params.set("unread", "1");
    if (statusFilter === "RESOLVED") params.set("status", "RESOLVED");
    else if (statusFilter === "" && !debouncedSearch) params.set("status", "OPEN,PENDING");
    return params;
  }, [campaignFilter, hasRepliedFilter, accountFilter, debouncedSearch, view, statusFilter]);

  // Mezcla las 4 fuentes en una sola página ordenada por lastMessageAt. No es
  // paginación combinada real a nivel de DB (cada fuente pagina por su cuenta
  // y se fusiona en el cliente) — con el volumen de chats esperado por cuenta
  // esto es suficiente y evita una vista SQL que uniera todas las tablas.
  // Cuando el filtro de cuenta activo apunta a un solo canal, las demás
  // fuentes se omiten (evita un 404 de "cuenta no encontrada" al pasarle un
  // id que no les pertenece, y ahorra los fetches). El filtro de campaña
  // también omite todo lo que no sea WhatsApp — las campañas son un concepto
  // exclusivo de Meta Cloud API, ningún otro canal las tiene.
  // `pages` va por canal a propósito: cada fuente pagina sobre su propio
  // total, así que derivar una sola página del total mezclado saltaba
  // registros (con 40 chats en cada canal, la primera página traía 30+30=60 y
  // la siguiente pedía la página 3 de ambos — vacía en las dos, dejando 20
  // chats inalcanzables y el botón "Cargar más" visible para siempre).
  const fetchChatsPage = useCallback(async (pages: Record<(typeof CHANNEL_SOURCES)[number]["channel"], number>, pageSize: number): Promise<{ items: ChatItem[]; total: number }> => {
    const selectedAccountChannel = accountFilter ? accounts.find((a) => a.id === accountFilter)?.channel : undefined;

    const results = await Promise.all(
      CHANNEL_SOURCES.map(async (source) => {
        const skip = (!!selectedAccountChannel && selectedAccountChannel !== source.channel) || (!!campaignFilter && source.channel !== "WHATSAPP");
        if (skip) return { items: [] as ChatItem[], total: 0 };
        const params = buildChannelParams(source.channel, pages[source.channel], pageSize);
        const response = await fetch(`${source.endpoint}?${params}`);
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.items)) throw new Error(data.error ?? "Error al cargar chats");
        return { items: Array.isArray(data.items) ? (data.items as ChatItem[]) : [], total: data.total ?? 0 };
      })
    );

    const items = results.flatMap((r) => r.items).sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });
    const total = results.reduce((sum, r) => sum + r.total, 0);
    return { items, total };
  }, [CHANNEL_SOURCES, accountFilter, accounts, campaignFilter, buildChannelParams]);

  const firstPagePerChannel = useMemo(
    () => Object.fromEntries(CHANNEL_SOURCES.map((s) => [s.channel, 1])) as Record<(typeof CHANNEL_SOURCES)[number]["channel"], number>,
    [CHANNEL_SOURCES]
  );

  const refreshChats = useCallback(async () => {
    try {
      const pageSize = Math.min(Math.max(chats.length, CHATS_PAGE_SIZE), 100);
      const { items, total } = await fetchChatsPage(firstPagePerChannel, pageSize);
      // La conversación abierta se conserva aunque deje de cumplir el filtro
      // (p. ej. al resolverla estando en "abiertos" o al leerla en "sin leer").
      setChats((prev) => keepOpenChat(prev, items, activeChatIdRef.current));
      setChatsTotal(total);
      setChatsError(null);
    } catch (error) {
      if (chats.length === 0) setChatsError(error instanceof Error ? error.message : "Error al cargar chats");
      else toastError("Error al actualizar chats");
    }
  }, [chats.length, fetchChatsPage, firstPagePerChannel, toastError]);

  const retryChats = useCallback(async () => {
    setLoadingChats(true);
    await refreshChats();
    setLoadingChats(false);
  }, [refreshChats]);

  const loadMoreChats = useCallback(async () => {
    setLoadingMoreChats(true);
    try {
      // La página se calcula por canal según cuántos de sus chats ya hay en
      // memoria. Cuando ese conteo no es múltiplo del tamaño de página, la
      // petición vuelve a traer algunos ya cargados — de ahí el dedupe por id
      // al anexar, que además cubre los que el polling haya insertado ya.
      const pages = Object.fromEntries(
        CHANNEL_SOURCES.map((s) => {
          const loaded = chats.filter((c) => c.channel === s.channel).length;
          return [s.channel, Math.floor(loaded / CHATS_PAGE_SIZE) + 1];
        })
      ) as Record<(typeof CHANNEL_SOURCES)[number]["channel"], number>;
      const { items, total } = await fetchChatsPage(pages, CHATS_PAGE_SIZE);
      setChats((prev) => {
        const known = new Set(prev.map((c) => c.id));
        return [...prev, ...items.filter((c) => !known.has(c.id))];
      });
      setChatsTotal(total);
    } catch {
      toastError("Error al cargar más chats");
    } finally {
      setLoadingMoreChats(false);
    }
  }, [CHANNEL_SOURCES, chats, fetchChatsPage, toastError]);

  // Handle URL changes to update state — tracked via a "previous prop" render-time
  // comparison (same idiom as Modal/Drawer's open/prevOpen) instead of an effect,
  // since calling setState directly in an effect body causes an extra cascading
  // render for what's really just deriving state from a changed prop.
  const [prevInitialChatId, setPrevInitialChatId] = useState(initialChatId);
  const [prevInitialAccountId, setPrevInitialAccountId] = useState(initialAccountId);
  const [prevInitialCampaignId, setPrevInitialCampaignId] = useState(initialCampaignId);
  const [prevInitialHasReplied, setPrevInitialHasReplied] = useState(initialHasReplied);
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);
  const [prevInitialView, setPrevInitialView] = useState(initialView);
  const [prevInitialStatus, setPrevInitialStatus] = useState(initialStatus);
  if (initialChatId !== prevInitialChatId) {
    setPrevInitialChatId(initialChatId);
    setSelectedChatId(initialChatId ?? null);
  }
  if (initialAccountId !== prevInitialAccountId) {
    setPrevInitialAccountId(initialAccountId);
    setAccountFilter(initialAccountId || "");
  }
  if (initialCampaignId !== prevInitialCampaignId) {
    setPrevInitialCampaignId(initialCampaignId);
    setCampaignFilter(initialCampaignId || "");
  }
  if (initialHasReplied !== prevInitialHasReplied) {
    setPrevInitialHasReplied(initialHasReplied);
    setHasRepliedFilter(initialHasReplied || "");
  }
  if (initialView !== prevInitialView) {
    setPrevInitialView(initialView);
    setView(initialView || "all");
  }
  if (initialStatus !== prevInitialStatus) {
    setPrevInitialStatus(initialStatus);
    setStatusFilter(initialStatus || "");
  }
  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    setSearch(initialSearch || "");
    setDebouncedSearch(initialSearch || "");
  }

  // Refleja los filtros activos en la URL (query string) para que sobrevivan
  // tanto al botón "volver" propio (handleCloseChat) como al atrás del
  // navegador — antes vivían solo en useState y se perdían apenas se navegaba
  // a la ruta del chat individual, que monta una instancia nueva del componente.
  const buildFilterSearchParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (accountFilter) params.set("accountId", accountFilter);
    if (campaignFilter) params.set("campaignId", campaignFilter);
    if (hasRepliedFilter) params.set("hasReplied", hasRepliedFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (view !== "all") params.set("view", view);
    if (statusFilter) params.set("status", statusFilter);
    return params;
  }, [accountFilter, campaignFilter, hasRepliedFilter, debouncedSearch, view, statusFilter]);

  useEffect(() => {
    const qs = buildFilterSearchParams().toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo resincroniza cuando cambian los filtros, no en cada render por pathname/router
  }, [accountFilter, campaignFilter, hasRepliedFilter, debouncedSearch, view, statusFilter]);

  // Campaign list for the filter dropdown — fetched once, doesn't depend on the
  // current chat filters.
  useEffect(() => {
    fetch("/api/whatsapp/campaigns")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setCampaigns(d.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {});
  }, []);

  // Load initial chats list
  useEffect(() => {
    const generation = ++chatsGenerationRef.current;
    async function reset() {
      setLoadingChats(true);
      setChatsError(null);
      try {
        const { items, total } = await fetchChatsPage(firstPagePerChannel, CHATS_PAGE_SIZE);
        if (generation !== chatsGenerationRef.current) return; // filtros cambiaron mientras tanto
        setChats((prev) => keepOpenChat(prev, items, activeChatIdRef.current));
        setChatsTotal(total);
      } catch (error) {
        if (generation === chatsGenerationRef.current) {
          setChats([]);
          setChatsTotal(0);
          setChatsError(error instanceof Error ? error.message : "Error al cargar chats");
        }
      } finally {
        if (generation === chatsGenerationRef.current) setLoadingChats(false);
      }
    }
    reset();
  }, [fetchChatsPage, firstPagePerChannel]);

  // Refresco periódico de la LISTA — antes solo se refrescaba cuando cambiaba
  // el chat abierto, así que las conversaciones nuevas de otros leads no
  // aparecían hasta recargar la página. Fusiona la primera página (nuevos y
  // actualizados arriba) con lo ya cargado en vez de reemplazarlo, para no
  // perder lo traído con "Cargar más". Se salta con la pestaña oculta.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      const generation = chatsGenerationRef.current;
      try {
        const { items, total } = await fetchChatsPage(firstPagePerChannel, CHATS_PAGE_SIZE);
        if (generation !== chatsGenerationRef.current) return;
        setChats((prev) => {
          const freshIds = new Set(items.map((c) => c.id));
          return [...items, ...prev.filter((c) => !freshIds.has(c.id))].sort((a, b) => {
            const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bt - at;
          });
        });
        setChatsTotal(total);
      } catch (err) {
        console.warn("Falló el refresco de la lista de chats, se reintenta en el próximo tick", err);
      }
    }, CHATS_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchChatsPage, firstPagePerChannel]);

  // Derived, not its own state — chats stays the single source of truth so every
  // mutation site only needs to update one place instead of keeping two in sync.
  const selectedChat = chats.find((c) => c.id === selectedChatId) ?? null;

  // Los enlaces desde Panel, Contactos y notificaciones pueden apuntar a un
  // chat anterior a la primera página. Se recupera por id dentro de la cuenta
  // autorizada y se incorpora a la lista para abrir también su hilo.
  useEffect(() => {
    if (!initialChatId || !routeAccountId || loadingChats || selectedChat) return;
    const account = accounts.find((a) => a.id === routeAccountId);
    const source = CHANNEL_SOURCES.find((item) => item.channel === account?.channel);
    if (!source) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- estado de enlace inválido
      setMissingChat(true);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ accountId: routeAccountId, chatId: initialChatId, page: "1", pageSize: "1" });
    fetch(`${source.endpoint}?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "No se pudo abrir el chat");
        const chat = Array.isArray(data.items) ? data.items[0] as ChatItem | undefined : undefined;
        if (!chat) { setMissingChat(true); return; }
        setMissingChat(false);
        setChats((current) => current.some((item) => item.id === chat.id) ? current : [chat, ...current]);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setMissingChat(true);
          toastError(error.message);
        }
      });
    return () => controller.abort();
  }, [initialChatId, routeAccountId, loadingChats, selectedChat, accounts, CHANNEL_SOURCES, toastError]);

  // Fetch canned responses
  useEffect(() => {
    if (!selectedChat) return;
    fetch(
      selectedChat.channel !== "WHATSAPP"
        ? `/api/whatsapp/canned-responses?channelAccountId=${selectedChat.accountId}`
        : `/api/whatsapp/canned-responses?waAccountId=${selectedChat.accountId}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setCannedResponses(d);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally narrowed to accountId so this doesn't refire on every chats[] update, only when the conversation's own account actually changes
  }, [selectedChat?.accountId]);

  // Fetch messages
  useEffect(() => {
    if (!selectedChatId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-chat-change
    setLoadingMessages(true);

    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/messages?limit=50`, { signal: controller.signal });
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (Array.isArray(data)) {
          setMessages(data);
          setHasOlderMessages(data.length >= 50);
        }
      } catch {
        if (!controller.signal.aborted) toastError("Error al cargar mensajes");
      } finally {
        if (!controller.signal.aborted) setLoadingMessages(false);
      }
    }
    load();
    return () => controller.abort();
  }, [selectedChatId, toastError]);

  const loadOlderMessages = useCallback(async () => {
    const oldest = messages[0];
    if (!selectedChatId || !oldest) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/whatsapp/chats/${selectedChatId}/messages?limit=50&before=${encodeURIComponent(oldest.timestamp)}`
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        prependHeightRef.current = messagesContainerRef.current?.scrollHeight ?? null;
        setMessages((prev) => [...data, ...prev]);
        setHasOlderMessages(data.length >= 50);
      }
    } catch {
      toastError("Error al cargar mensajes anteriores");
    } finally {
      setLoadingOlder(false);
    }
  }, [selectedChatId, messages, toastError]);

  // Scroll to bottom on new messages — but only if the user was already near the
  // bottom, so the 5s poll below doesn't yank someone reading older history back
  // down every time it silently no-ops on an unchanged message list.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    // Tras prepender historial, se restaura la posición de lectura en lugar
    // de auto-scrollear al fondo.
    if (prependHeightRef.current !== null) {
      container.scrollTop += container.scrollHeight - prependHeightRef.current;
      prependHeightRef.current = null;
      return;
    }
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 200) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Message polling
  useEffect(() => {
    if (!selectedChatId) return;
    const controller = new AbortController();
    const interval = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/messages?limit=50`, { signal: controller.signal });
        const data = (await res.json()) as Message[];
        if (controller.signal.aborted) return; // efecto ya limpiado
        if (Array.isArray(data) && data.length > 0) {
          let anyChange = false;
          setMessages((prev) => {
            // Merge en lugar de reemplazo: el reemplazo total descartaba el
            // historial cargado con "Ver anteriores". Se actualizan status y
            // mediaUrl de los conocidos y se anexan solo los nuevos.
            const byId = new Map(data.map((m) => [m.id, m]));
            let changed = false;
            const merged = prev.map((m) => {
              const fresh = byId.get(m.id);
              if (fresh && (fresh.status !== m.status || fresh.mediaUrl !== m.mediaUrl || fresh.reactionEmoji !== m.reactionEmoji || fresh.agentReactionEmoji !== m.agentReactionEmoji || JSON.stringify(fresh.agentReactions) !== JSON.stringify(m.agentReactions) || fresh.replyToWamid !== m.replyToWamid || JSON.stringify(fresh.replyTo) !== JSON.stringify(m.replyTo))) {
                changed = true;
                return { ...fresh, motionKey: m.motionKey, animateOnMount: false };
              }
              return m;
            });
            const known = new Set(prev.map((m) => m.id));
            const newMessages = data.filter((m) => !known.has(m.id));
            const appended = newMessages.map((m, index) => ({
              ...m,
              // Al volver a una pestaña puede llegar un lote grande: anima
              // solo los últimos, no toda la conversación a la vez.
              animateOnMount: index >= newMessages.length - 3,
            }));
            if (!changed && appended.length === 0) return prev;
            anyChange = true;
            return [...merged, ...appended];
          });
          if (anyChange) refreshChats();
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        // Poll de 5s: un toast por cada blip de red sería spam — el siguiente
        // tick reintenta solo. Se registra para no perder el diagnóstico.
        console.warn("Fallo el poll de mensajes, se reintenta en 5s", err);
      }
    }, 5000);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [selectedChatId, refreshChats]);

  const clearAttachment = useCallback(() => {
    setAttachment(null);
    setAttachmentPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  // Cada conversación tiene su propio destino y capacidades de canal. Un
  // borrador interactivo/adjunto de otra conversación no debe poder enviarse
  // por accidente al cambiar de chat.
  const handleChatSelect = useCallback((chat: ChatItem) => {
    if (chat.id === selectedChatId) return;
    if (selectedChatId) messageDraftsRef.current.set(selectedChatId, newMessage);
    setSelectedChatId(chat.id);
    setNewMessage(messageDraftsRef.current.get(chat.id) ?? "");
    setReplyTo(null);
    setCannedResponses([]);
    setCannedIndex(0);
    setInteractiveButtons([]);
    setButtonsPanelOpen(false);
    clearAttachment();
    const qs = buildFilterSearchParams().toString();
    router.push(`/whatsapp/chat/${chat.accountId}/${chat.id}${qs ? `?${qs}` : ""}`);
  }, [selectedChatId, newMessage, router, buildFilterSearchParams, clearAttachment]);

  const handleCloseChat = useCallback(() => {
    if (selectedChatId) messageDraftsRef.current.set(selectedChatId, newMessage);
    setSelectedChatId(null);
    setNewMessage("");
    setReplyTo(null);
    setCannedResponses([]);
    setCannedIndex(0);
    setInteractiveButtons([]);
    setButtonsPanelOpen(false);
    clearAttachment();
    const qs = buildFilterSearchParams().toString();
    router.push(`/whatsapp/chat${qs ? `?${qs}` : ""}`);
  }, [selectedChatId, newMessage, router, clearAttachment, buildFilterSearchParams]);

  function detectMessageType(file: File): "image" | "audio" | "video" | "document" | "sticker" {
    if (isImageMime(file.type)) return "image";
    if (isAudioMime(file.type)) return "audio";
    if (isVideoMime(file.type)) return "video";
    return "document";
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toastError("El archivo supera el límite de 20MB");
      e.target.value = "";
      return;
    }
    setAttachment(file);
    setAttachmentPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
    e.target.value = "";
  }

  // Hace el envío real (upload + send o solo send) y resuelve el mensaje
  // optimista `tempId` ya insertado en pantalla: lo reemplaza por el mensaje
  // real que devuelve el servidor, o lo marca "failed" con opción de
  // reintentar. Compartido por el submit del composer y por el botón
  // "Reintentar" de una burbuja fallida.
  const performSend = useCallback(
    async (tempId: string, opts: { text: string; file: File | null; filePreviewUrl: string | null; buttons: string[]; replyTo: Message | null }) => {
      if (!selectedChatId || !selectedChat) return;
      try {
        let data;
        if (opts.buttons.length > 0) {
          const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "interactive",
              body: opts.text.trim(),
              buttons: opts.buttons.map((title) => ({ title })),
              replyToMessageId: opts.replyTo?.id,
            }),
          });
          data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Error al enviar");
        } else if (opts.file) {
          const uploadForm = new FormData();
          uploadForm.append("file", opts.file);
          uploadForm.append("accountId", selectedChat.accountId);

          const uploadUrl = MEDIA_UPLOAD_ENDPOINT[selectedChat.channel];
          const upRes = await fetch(uploadUrl, { method: "POST", body: uploadForm });
          const upData = await upRes.json();
          if (!upRes.ok) throw new Error(upData.error ?? "Error al subir el medio");

          const type = detectMessageType(opts.file);
          const caption = opts.text.trim() || undefined;
          const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type,
              mediaId: upData.mediaId,
              mimeType: upData.mimeType,
              filename: upData.filename,
              caption,
              localMediaPath: upData.localMediaPath,
              bytesSize: upData.bytesSize,
              replyToMessageId: opts.replyTo?.id,
            }),
          });
          data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Error al enviar");
        } else {
          const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "text", body: opts.text.trim(), replyToMessageId: opts.replyTo?.id }),
          });
          data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Error al enviar");
        }
        // El id real puede ya estar en pantalla si el poll de 5s lo trajo
        // antes que esta respuesta — se descarta cualquier duplicado.
        setMessages((prev) => {
          const optimistic = prev.find((m) => m.id === tempId);
          return [
            ...prev.filter((m) => m.id !== tempId && m.id !== data.id),
            { ...data, replyTo: opts.replyTo ? { id: opts.replyTo.id, direction: opts.replyTo.direction, body: opts.replyTo.body, caption: opts.replyTo.caption, messageType: opts.replyTo.messageType } : null, motionKey: optimistic?.motionKey ?? data.id },
          ];
        });
        if (opts.filePreviewUrl) URL.revokeObjectURL(opts.filePreviewUrl);
        pendingSendsRef.current.delete(tempId);
        refreshChats();
      } catch (err) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
        toastError(err instanceof Error ? err.message : "Error al enviar");
      }
    },
    [selectedChatId, selectedChat, toastError, refreshChats]
  );

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (!newMessage.trim() && !attachment && interactiveButtons.length === 0) return;
    if (interactiveButtons.length > 0 && (!newMessage.trim() || interactiveButtons.some((title) => !title.trim()))) return;
    if (!selectedChatId || !selectedChat) return;

    const tempId = `temp-${crypto.randomUUID()}`;
    const text = newMessage;
    const file = attachment;
    const filePreviewUrl = file ? attachmentPreview : null;
    const buttons = interactiveButtons;
    const quotedMessage = selectedChat.channel === "WHATSAPP" ? replyTo : null;

    const optimisticMessage: Message = {
      id: tempId,
      motionKey: tempId,
      animateOnMount: true,
      direction: "OUTBOUND",
      messageType: buttons.length > 0 ? "interactive" : file ? detectMessageType(file) : "text",
      body: file ? null : text.trim(),
      caption: file && text.trim() ? text.trim() : null,
      mediaId: null,
      mediaUrl: file ? "pending" : null,
      localPreviewUrl: filePreviewUrl ?? undefined,
      mimeType: file?.type ?? null,
      filename: file?.name ?? null,
      bytesSize: file?.size ?? null,
      interactivePayload:
        buttons.length > 0
          ? { buttons: buttons.map((title, i) => ({ id: `btn_${i + 1}`, title })) }
          : undefined,
      status: "sending",
      replyToWamid: quotedMessage?.wamid ?? null,
      replyTo: quotedMessage ? { id: quotedMessage.id, direction: quotedMessage.direction, body: quotedMessage.body, caption: quotedMessage.caption, messageType: quotedMessage.messageType } : null,
      timestamp: new Date().toISOString(),
    };

    pendingSendsRef.current.set(tempId, { text, file, filePreviewUrl, buttons, replyTo: quotedMessage });
    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");
    messageDraftsRef.current.delete(selectedChatId);
    setReplyTo(null);
    // Reset del composer sin revocar el object URL todavía — la burbuja
    // optimista lo sigue usando hasta que el envío se confirme o falle.
    setAttachment(null);
    setAttachmentPreview(null);
    setInteractiveButtons([]);
    setButtonsPanelOpen(false);

    setSending(true);
    await performSend(tempId, { text, file, filePreviewUrl, buttons, replyTo: quotedMessage });
    setSending(false);
  }

  async function sendSticker(stickerId: string) {
    if (!selectedChatId || selectedChat?.channel !== "WHATSAPP" || sending) throw new Error("Selecciona una conversación de WhatsApp disponible");
    const targetChatId = selectedChatId;
    const quotedMessage = replyTo;
    setSending(true);
    try {
      const res = await fetch(`/api/whatsapp/chats/${targetChatId}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "sticker", stickerId, replyToMessageId: quotedMessage?.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar el sticker");
      if (activeChatIdRef.current === targetChatId) {
        setMessages((previous) => [...previous.filter((message) => message.id !== data.id), { ...data, animateOnMount: true, replyTo: quotedMessage }]);
        setReplyTo(null);
      }
      refreshChats();
    } finally { setSending(false); }
  }

  const handleRetry = useCallback(
    (msg: Message) => {
      const pending = pendingSendsRef.current.get(msg.id);
      if (!pending) return;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: "sending" } : m)));
      performSend(msg.id, pending);
    },
    [performSend]
  );

  async function handleStatusChange(newStatus: ChatStatus) {
    if (!selectedChatId) return;
    try {
      const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cambiar estado");
      setChats((prev) => prev.map((c) => (c.id === selectedChatId ? { ...c, status: data.status } : c)));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al cambiar estado");
    }
  }

  const accountOptions = accounts.length > 0
    ? accounts
    : Array.from(new Map(chats.map((c) => [c.account.id, c.account])).values());

  // Cuántos chats sin leer tiene cada cuenta — badge del rail. Se calcula
  // sobre `chats` (ya puede estar acotado a una sola cuenta si el rail o el
  // <Select> mobile ya filtraron), así que no pretende ser un total global
  // exacto entre cuentas mientras hay un filtro activo — mismo criterio
  // "instantáneo" que el resto de los contadores derivados de este estado.
  const unreadByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of chats) map[c.accountId] = (map[c.accountId] ?? 0) + c.unreadCount;
    return map;
  }, [chats]);

  // El servidor ya aplica cuenta + búsqueda (debounced); este filtro replica el
  // criterio en el cliente solo para dar respuesta instantánea mientras el
  // debounce/fetch está en vuelo.
  const filteredChats = chats.filter((c) => {
    if (accountFilter && c.accountId !== accountFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.name?.toLowerCase().includes(q)) ||
      c.remoteJid.includes(q) ||
      c.lastMessage?.toLowerCase().includes(q)
    );
  });

  const cannedQuery = newMessage.startsWith("/") && !newMessage.includes(" ")
    ? newMessage.slice(1).toLowerCase()
    : null;
  const cannedSuggestions = cannedQuery !== null
    ? cannedResponses.filter((c) => c.shortcut.startsWith(cannedQuery)).slice(0, 6)
    : [];

  function insertCannedResponse(content: string) {
    setNewMessage(content);
    setCannedIndex(0);
  }

  const listPane = (
      <ChatListPanel
        resizable={resizable}
        selectedChatId={selectedChatId}
        onChatSelect={handleChatSelect}
        accountOptions={accountOptions}
        accountFilter={accountFilter}
        onAccountFilterChange={setAccountFilter}
        search={search}
        onSearchChange={setSearch}
        view={view}
        onViewChange={setView}
        campaigns={campaigns}
        campaignFilter={campaignFilter}
        onCampaignFilterChange={setCampaignFilter}
        hasRepliedFilter={hasRepliedFilter}
        onHasRepliedFilterChange={setHasRepliedFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        loadingChats={loadingChats}
        loadError={chatsError}
        onRetry={retryChats}
        totalChatsLoaded={chats.length}
        chats={filteredChats}
        chatsTotal={chatsTotal}
        loadingMoreChats={loadingMoreChats}
        onLoadMore={loadMoreChats}
      />
  );

  const sidePanelVisible = wide && sidePanelPref && !!selectedChat;
  function toggleSidePanel() {
    if (wide) {
      const next = !sidePanelPref;
      setSidePanelPref(next);
      try { window.localStorage.setItem(SIDE_PANEL_KEY, next ? "1" : "0"); } catch { /* sin almacenamiento: la preferencia vale solo esta sesión */ }
    } else {
      setContactDrawerOpen((open) => !open);
    }
  }

  const conversationPane = (
      <div className={`${selectedChatId ? "flex" : "hidden lg:flex"} min-w-0 flex-1`}>
        <div className="flex min-w-0 flex-1 flex-col bg-background">
        {!selectedChatId ? (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
                <EmptyTitle>Selecciona una conversación</EmptyTitle>
                <EmptyDescription>{chats.length === 0 ? "Conecta un canal para empezar a recibir mensajes." : "Elige una conversación de la lista para ver los mensajes y la ficha del contacto."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : selectedChat ? (
          <>
            <ChatThreadPanel
              selectedChat={selectedChat}
              messages={messages}
              loadingMessages={loadingMessages}
              hasOlderMessages={hasOlderMessages}
              loadingOlder={loadingOlder}
              onLoadOlder={loadOlderMessages}
              onCloseChat={handleCloseChat}
              sidePanelOpen={wide ? sidePanelPref : contactDrawerOpen}
              onToggleSidePanel={toggleSidePanel}
              onStatusChange={handleStatusChange}
              onAssigned={(assignee) =>
                setChats((prev) => prev.map((c) =>
                  c.id === selectedChatId ? { ...c, assignedTo: assignee, assignedToId: assignee?.id ?? null } : c
                ))
              }
              onPreview={setPreviewMedia}
              onRetry={handleRetry}
              onReply={setReplyTo}
              onReaction={(id, reaction) => setMessages((previous) => previous.map((message) => message.id === id ? { ...message, agentReactions: [reaction] } : message))}
              messagesContainerRef={messagesContainerRef}
              messagesEndRef={messagesEndRef}
            />
            <ChatComposer
              chatId={selectedChat.id}
              channel={selectedChat.channel}
              newMessage={newMessage}
              onMessageChange={setNewMessage}
              sending={sending}
              onSubmit={handleSend}
              onSendSticker={sendSticker}
              replyTo={replyTo}
              leadName={selectedChat.name || selectedChat.remoteJid}
              onCancelReply={() => setReplyTo(null)}
              attachment={attachment}
              attachmentPreview={attachmentPreview}
              onPickFile={pickFile}
              onFileChosen={onFileChosen}
              onClearAttachment={clearAttachment}
              fileInputRef={fileInputRef}
              cannedSuggestions={cannedSuggestions}
              cannedIndex={cannedIndex}
              onCannedIndexChange={setCannedIndex}
              onInsertCanned={insertCannedResponse}
              // Webchat es MVP solo texto (roadmap P3-f) — sin medios, mismo
              // criterio que interactiveDisabled ya aplica para "no
              // WhatsApp" en botones interactivos.
              attachmentsDisabled={interactiveButtons.length > 0 || selectedChat.channel === "WEBCHAT"}
              interactiveButtons={interactiveButtons}
              onButtonsChange={setInteractiveButtons}
              buttonsPanelOpen={buttonsPanelOpen}
              onToggleButtonsPanel={() => setButtonsPanelOpen((v) => !v)}
              interactiveDisabled={selectedChat.channel !== "WHATSAPP" || !!attachment}
            />
          </>
        ) : missingChat ? (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
                <EmptyTitle>Chat no encontrado</EmptyTitle>
                <EmptyDescription>Esta conversación no está disponible para tu cuenta.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        )}
        </div>
        {sidePanelVisible && selectedChat && (
          <aside aria-label="Ficha y detalles" className="flex w-80 shrink-0 flex-col border-l bg-card">
            <ChatSidePanel key={selectedChat.id} chat={selectedChat} onStatusChange={handleStatusChange} onUpdated={refreshChats} />
          </aside>
        )}
      </div>
  );

  return (
    <div className="flex min-h-0 flex-1 bg-background">
      <ChatAccountRail accounts={accountOptions} selectedAccountId={accountFilter} onSelect={setAccountFilter} unreadByAccount={unreadByAccount} />
      {resizable ? <Group orientation="horizontal" className="h-full min-w-0 flex-1">
        <Panel id="conversations" defaultSize="26%" minSize="260px" maxSize="42%" className="flex min-w-0">{listPane}</Panel>
        <Separator aria-label="Ajustar ancho de conversaciones" className="relative w-1 shrink-0 bg-transparent transition-colors hover:bg-primary/25 focus-visible:bg-primary/25 data-[separator=active]:bg-primary/40" />
        <Panel id="conversation" defaultSize="74%" minSize="360px" className="flex min-w-0">{conversationPane}</Panel>
      </Group> : <>{listPane}{conversationPane}</>}

      {/* Drawers */}
      {!wide && contactDrawerOpen && selectedChat?.contactId && (
        <ContactDrawer
          contactId={selectedChat.contactId}
          onClose={() => setContactDrawerOpen(false)}
          onUpdated={refreshChats}
        />
      )}

      <MediaPreviewModal media={previewMedia} onClose={() => setPreviewMedia(null)} />
    </div>
  );
}
