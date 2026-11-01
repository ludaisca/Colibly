"use client";

import { displayName } from "@/lib/chats/display-name";
import { adjacentIndex, isTypingTarget, matchInboxShortcut, shouldHandleShortcut, type InboxShortcutAction } from "@/lib/inbox/shortcuts";
import { assignChatTo, assignChatToMe, oneHourFromNow, setChatPriority, snoozeChat } from "@/lib/inbox/actions";
import { ShortcutsModal } from "./shortcuts-modal";
import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/app/components/ui/empty-state";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { ContactDrawer } from "@/app/components/whatsapp/contact-drawer";
import { ChatAccountRail } from "@/app/components/whatsapp/chat-account-rail";
import { ChatListPanel } from "@/app/components/whatsapp/chat-list-panel";
import { ChatThreadPanel, MediaPreviewModal } from "@/app/components/whatsapp/chat-thread-panel";
import { ChatComposer } from "@/app/components/whatsapp/chat-composer";
import { ChatClaimBanner } from "@/app/components/whatsapp/chat-claim-banner";
import { useNowMs } from "@/app/components/whatsapp/use-now";
import { ChatDisplayNameBanner, ChatWindowBanner, useChatServiceWindow } from "@/app/components/whatsapp/chat-window-banner";
import { TemplatePickerModal } from "@/app/components/whatsapp/template-picker-modal";
import { isImageMime, isAudioMime, isVideoMime } from "@/lib/whatsapp/media-shared";
import { MessageSearchResults } from "@/app/components/whatsapp/message-search-results";
import { RequiredFieldsModal } from "@/app/components/whatsapp/required-fields-modal";
import { useBusinessName } from "@/app/components/ui/business-context";
import { renderCannedResponse } from "@/lib/inbox/canned-variables";
import type { MessageSearchHit } from "@/lib/search/messages";
import {
  CHATS_PAGE_SIZE,
  CHATS_LIST_POLL_MS,
  type Channel,
  type ChatBulkAction,
  type ChatRowAction,
  type ChatItem,
  type ChatPriority,
  type ChatStatus,
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
  initialAccountId?: string;
  initialChatId?: string;
  /** ?mensaje=<id>: abre el chat saltando a ese mensaje (búsqueda "En mensajes"). */
  initialMessageId?: string;
  initialCampaignId?: string;
  initialHasReplied?: "" | "yes" | "no";
  initialAssigned?: "" | "me" | "unassigned";
  initialPriority?: ChatPriority | "";
  initialSnoozed?: "" | "only" | "all";
  initialAwaiting?: boolean;
  initialSearch?: string;
  initialContactId?: string;
}

export function ChatWorkspace({
  initialAccounts,
  initialAccountId,
  initialChatId,
  initialMessageId,
  initialCampaignId,
  initialHasReplied,
  initialAssigned,
  initialPriority,
  initialSnoozed,
  initialAwaiting,
  initialSearch,
  initialContactId,
}: ChatWorkspaceProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const businessName = useBusinessName();
  // Firma personal activa (F6): solo para el aviso del compositor; el
  // servidor la agrega al enviar.
  const [signature, setSignature] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/auth/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSignature(data?.signatureEnabled && data.messageSignature ? data.messageSignature : null))
      .catch(() => {});
  }, []);
  const currentUserId = session?.user?.id ?? null;
  const { success: toastSuccess, error: toastError } = useToast();
  const draftKey = useCallback(
    (chatId: string) => currentUserId ? `colibly_chat_draft:${currentUserId}:${chatId}` : null,
    [currentUserId]
  );
  const writeDraft = useCallback((chatId: string, value: string) => {
    const key = draftKey(chatId);
    if (!key) return;
    if (value.trim()) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  }, [draftKey]);
  const resizable = useSyncExternalStore(
    (onChange) => { const query = window.matchMedia("(min-width: 1024px)"); query.addEventListener("change", onChange); return () => query.removeEventListener("change", onChange); },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false
  );

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [missingChat, setMissingChat] = useState(false);
  const [loadingMoreChats, setLoadingMoreChats] = useState(false);
  const [chatsTotal, setChatsTotal] = useState(0);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId || null);
  // Salto desde "En mensajes": el chat se abre cargando la ventana alrededor
  // del mensaje (?around=) y el hilo lo ilumina. jumpRef se consume en el
  // efecto de carga; skipAutoScrollRef evita que el auto-scroll al fondo pise
  // el salto.
  // Solo se limpia al consumirse (el doble montaje de StrictMode en dev
  // correría el efecto dos veces). Si el workspace se remonta al cambiar de
  // ruta, el salto sigue llegando por ?mensaje= (initialMessageId).
  const [requiredPrompt, setRequiredPrompt] = useState<{ chatId: string; keys: string[] } | null>(null);
  const jumpRef = useRef<{ chatId: string; messageId: string } | null>(null);
  const skipAutoScrollRef = useRef(false);
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
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
  const [assignedFilter, setAssignedFilter] = useState<"" | "me" | "unassigned">(initialAssigned || "");
  const [priorityFilter, setPriorityFilter] = useState<ChatPriority | "">(initialPriority || "");
  const [snoozedFilter, setSnoozedFilter] = useState<"" | "only" | "all">(initialSnoozed || "");
  // "Esperando respuesta": el último mensaje es del cliente y nadie contestó.
  const [awaitingFilter, setAwaitingFilter] = useState<boolean>(initialAwaiting ?? false);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const accounts = initialAccounts;
  // Las cuentas llegan del servidor: un filtro de cuenta ya conoce su canal
  // antes de pedir chats y no consulta los otros cuatro endpoints por error.
  const [contactDrawerContactId, setContactDrawerContactId] = useState<string | null>(initialContactId ?? null);
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null);
  const [cannedResponses, setCannedResponses] = useState<CannedResponseItem[]>([]);
  // Sugerencia de respuesta rápida resaltada — navegable con ↑/↓, se inserta
  // con Enter o Tab.
  const [cannedIndex, setCannedIndex] = useState(0);
  // Selección múltiple de la lista para asignar/resolver/priorizar/posponer
  // en lote. Se activa explícitamente para no llenar cada fila de checkboxes.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(() => new Set());
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Array<{ id: string; name: string | null }>>([]);
  const lastTypingSentRef = useRef(0);
  const hydratedDraftRef = useRef<string | null>(null);

  // Media attachments state
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  // Botones de respuesta rápida en construcción para el próximo envío (solo
  // WhatsApp Meta — ver "Interactive messages in every channel" en docs/arquitectura/integraciones.md).
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
  // Chat cuyo primer lote de mensajes aún no se ha llevado al final. Sin esto
  // el hilo abría en el mensaje más viejo, porque scrollTop=0 hace que la
  // condición de "cerca del final" nunca se cumpla en la carga inicial.
  const initialScrollRef = useRef<string | null>(null);
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

  // Borrador persistente por usuario y chat. El ref en memoria ya cubre el
  // cambio de chat dentro de la sesión; localStorage sobrevive a un F5.
  useEffect(() => {
    if (!selectedChatId || !currentUserId || hydratedDraftRef.current === selectedChatId) return;
    hydratedDraftRef.current = selectedChatId;
    if (messageDraftsRef.current.has(selectedChatId)) return;
    const key = draftKey(selectedChatId);
    const stored = key ? window.localStorage.getItem(key) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación única del borrador guardado
    if (stored) setNewMessage(stored);
  }, [selectedChatId, currentUserId, draftKey]);

  useEffect(() => {
    if (!selectedChatId) return;
    const key = draftKey(selectedChatId);
    if (!key) return;
    const value = newMessage;
    const timer = window.setTimeout(() => {
      if (value.trim()) window.localStorage.setItem(key, value);
      else window.localStorage.removeItem(key);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [newMessage, selectedChatId, draftKey]);

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
    if (assignedFilter) params.set("assigned", assignedFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (snoozedFilter) params.set("snoozed", snoozedFilter);
    if (awaitingFilter) params.set("awaiting", "1");
    if (accountFilter) params.set("accountId", accountFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params;
  }, [campaignFilter, hasRepliedFilter, assignedFilter, priorityFilter, snoozedFilter, awaitingFilter, accountFilter, debouncedSearch]);

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
      setChats(items);
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
  const [prevInitialAssigned, setPrevInitialAssigned] = useState(initialAssigned);
  const [prevInitialPriority, setPrevInitialPriority] = useState(initialPriority);
  const [prevInitialSnoozed, setPrevInitialSnoozed] = useState(initialSnoozed);
  const [prevInitialAwaiting, setPrevInitialAwaiting] = useState(initialAwaiting);
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);
  const [prevInitialContactId, setPrevInitialContactId] = useState(initialContactId);
  if (initialChatId !== prevInitialChatId) {
    setPrevInitialChatId(initialChatId);
    if (initialChatId) setSelectedChatId(initialChatId);
  }
  if (initialAccountId !== prevInitialAccountId) {
    setPrevInitialAccountId(initialAccountId);
    if (initialAccountId) setAccountFilter(initialAccountId);
  }
  if (initialCampaignId !== prevInitialCampaignId) {
    setPrevInitialCampaignId(initialCampaignId);
    setCampaignFilter(initialCampaignId || "");
  }
  if (initialHasReplied !== prevInitialHasReplied) {
    setPrevInitialHasReplied(initialHasReplied);
    setHasRepliedFilter(initialHasReplied || "");
  }
  if (initialAssigned !== prevInitialAssigned) {
    setPrevInitialAssigned(initialAssigned);
    setAssignedFilter(initialAssigned || "");
  }
  if (initialPriority !== prevInitialPriority) {
    setPrevInitialPriority(initialPriority);
    setPriorityFilter(initialPriority || "");
  }
  if (initialSnoozed !== prevInitialSnoozed) {
    setPrevInitialSnoozed(initialSnoozed);
    setSnoozedFilter(initialSnoozed || "");
  }
  if (initialAwaiting !== prevInitialAwaiting) {
    setPrevInitialAwaiting(initialAwaiting);
    setAwaitingFilter(initialAwaiting ?? false);
  }
  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    setSearch(initialSearch || "");
    setDebouncedSearch(initialSearch || "");
  }
  if (initialContactId !== prevInitialContactId) {
    setPrevInitialContactId(initialContactId);
    setContactDrawerContactId(initialContactId ?? null);
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
    if (assignedFilter) params.set("assigned", assignedFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (snoozedFilter) params.set("snoozed", snoozedFilter);
    if (awaitingFilter) params.set("awaiting", "1");
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params;
  }, [accountFilter, campaignFilter, hasRepliedFilter, assignedFilter, priorityFilter, snoozedFilter, awaitingFilter, debouncedSearch]);

  // Sincroniza la URL sin navegar. `router.replace()` volvía a renderizar el
  // árbol del servidor y recargaba la conversación (por eso se había quitado y
  // los filtros dejaron de sobrevivir a un F5); el History API solo cambia la
  // barra de direcciones.
  useEffect(() => {
    const params = buildFilterSearchParams();
    // `contacto` no es un filtro de la lista: se conserva para que el deep
    // link del drawer no desaparezca cuando cambian los filtros.
    // Igual `ficha` (pestaña de la ficha) y `mensaje` (salto desde la
    // búsqueda: si se borra, useSearchParams cambia y la carga del hilo se
    // repite sin el salto).
    const current = new URLSearchParams(window.location.search);
    for (const key of ["contacto", "mensaje", "ficha"]) {
      const value = current.get(key);
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [buildFilterSearchParams]);

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
        setChats(items);
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
  // `known` separa "Meta dice que el nombre no está aprobado" de "no se pudo
  // consultar". Solo el primer caso bloquea el envío: antes un timeout de
  // Graph dejaba la conversación muda y culpaba al nombre para mostrar.
  const [quoteAccount, setQuoteAccount] = useState<{ accountId: string; approved: boolean; known: boolean } | null>(null);
  const displayNameBlocked = selectedChat?.channel === "WHATSAPP" && quoteAccount?.accountId === selectedChat.accountId && quoteAccount.known && !quoteAccount.approved;
  const quoteEnabled = selectedChat?.channel === "WHATSAPP" && quoteAccount?.accountId === selectedChat.accountId && !displayNameBlocked;
  useEffect(() => {
    if (selectedChat?.channel !== "WHATSAPP") return;
    const accountId = selectedChat.accountId;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/whatsapp/accounts/${accountId}/display-name`);
        const data = await res.json().catch(() => null);
        const approved = res.ok && data?.approved === true;
        const known = res.ok && data?.known === true;
        if (cancelled) return;
        setQuoteAccount({ accountId, approved, known });
        if (known && !approved) setReplyTo(null);
      } catch {
        if (cancelled) return;
        // Fallo de red: se permite escribir; si Meta rechaza, el error se ve.
        setQuoteAccount({ accountId, approved: false, known: false });
      }
    }
    load();
    const timer = setInterval(load, 120_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedChat?.channel, selectedChat?.accountId]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  // Último entrante cargado: al llegar uno nuevo se vuelve a consultar la ventana.
  const latestInboundAt = useMemo(() => {
    let latest: string | null = null;
    for (const m of messages) if (m.direction === "INBOUND" && (!latest || m.timestamp > latest)) latest = m.timestamp;
    return latest;
  }, [messages]);
  const serviceWindow = useChatServiceWindow(selectedChat?.id ?? null, selectedChat?.channel === "WHATSAPP", latestInboundAt);

  // Los enlaces desde Panel, Contactos y notificaciones pueden apuntar a un
  // chat anterior a la primera página. Se recupera por id dentro de la cuenta
  // autorizada y se incorpora a la lista para abrir también su hilo.
  useEffect(() => {
    if (!initialChatId || !initialAccountId || loadingChats || selectedChat) return;
    const account = accounts.find((a) => a.id === initialAccountId);
    const source = CHANNEL_SOURCES.find((item) => item.channel === account?.channel);
    if (!source) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- estado de enlace inválido
      setMissingChat(true);
      return;
    }
    const controller = new AbortController();
    // `snoozed=all` para que un enlace directo a un chat pospuesto lo abra
    // igual: la lista normal lo oculta, pero el hilo debe poder mostrarse.
    const params = new URLSearchParams({ accountId: initialAccountId, chatId: initialChatId, page: "1", pageSize: "1", snoozed: "all" });
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
  }, [initialChatId, initialAccountId, loadingChats, selectedChat, accounts, CHANNEL_SOURCES, toastError]);

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
    const fromUrl = initialMessageId && initialChatId === selectedChatId ? { chatId: selectedChatId, messageId: initialMessageId } : null;
    const jump = (jumpRef.current?.chatId === selectedChatId ? jumpRef.current : null) ?? fromUrl;
    async function load() {
      try {
        if (jump) {
          const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/messages?around=${encodeURIComponent(jump.messageId)}`, { signal: controller.signal });
          const data = await res.json();
          if (controller.signal.aborted) return;
          jumpRef.current = null;
          if (res.ok && Array.isArray(data)) {
            skipAutoScrollRef.current = true;
            setMessages(data);
            setHasOlderMessages(true);
            setFocusMessageId(jump.messageId);
            return;
          }
          // Muy lejos o ya no existe: se avisa y se abre el chat normal.
          toastError(typeof data?.error === "string" ? data.error : "No se pudo saltar al mensaje");
        }
        const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/messages?limit=50`, { signal: controller.signal });
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (Array.isArray(data)) {
          initialScrollRef.current = selectedChatId;
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
    // initialChatId fuera de las deps a propósito: cambia justo después de
    // selectedChatId al navegar y dispararía una segunda carga del hilo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId, initialMessageId, toastError]);

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
    // Recién cargada la ventana de un salto: el hilo hace scroll al mensaje.
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    // Tras prepender historial, se restaura la posición de lectura en lugar
    // de auto-scrollear al fondo.
    if (prependHeightRef.current !== null) {
      container.scrollTop += container.scrollHeight - prependHeightRef.current;
      prependHeightRef.current = null;
      return;
    }
    // Primer lote de este chat: saltar al final sin animación (el hilo debe
    // abrir en el último mensaje, como WhatsApp).
    if (initialScrollRef.current === selectedChatId && messages.length > 0) {
      initialScrollRef.current = null;
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      return;
    }
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 200) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, selectedChatId]);

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
              if (fresh && (fresh.status !== m.status || fresh.mediaUrl !== m.mediaUrl || fresh.body !== m.body || fresh.caption !== m.caption || fresh.reactionEmoji !== m.reactionEmoji || fresh.agentReactionEmoji !== m.agentReactionEmoji || JSON.stringify(fresh.agentReactions) !== JSON.stringify(m.agentReactions) || fresh.replyToWamid !== m.replyToWamid || fresh.transcript !== m.transcript || JSON.stringify(fresh.replyTo) !== JSON.stringify(m.replyTo))) {
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

  // Indicador de "está escribiendo" — TTL corto en Redis; se consulta con el
  // mismo ritmo del poll de mensajes.
  useEffect(() => {
    if (!selectedChatId) return;
    let cancelled = false;
    async function load() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/typing`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setTypingUsers(Array.isArray(data.users) ? data.users : []);
      } catch {
        // efímero: el siguiente tick reintenta
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedChatId]);

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
  const openChat = useCallback((chatId: string, accountId: string, messageId?: string) => {
    if (chatId === selectedChatId) return;
    if (selectedChatId) {
      messageDraftsRef.current.set(selectedChatId, newMessage);
      writeDraft(selectedChatId, newMessage);
    }
    setSelectedChatId(chatId);
    setFocusMessageId(null);
    const key = draftKey(chatId);
    const stored = key ? window.localStorage.getItem(key) : null;
    setNewMessage(messageDraftsRef.current.get(chatId) ?? stored ?? "");
    setReplyTo(null);
    setCannedResponses([]);
    setCannedIndex(0);
    setInteractiveButtons([]);
    setButtonsPanelOpen(false);
    lastTypingSentRef.current = 0;
    setTypingUsers([]);
    clearAttachment();
    const params = buildFilterSearchParams();
    if (messageId) params.set("mensaje", messageId);
    const qs = params.toString();
    router.push(`/whatsapp/chat/${accountId}/${chatId}${qs ? `?${qs}` : ""}`);
  }, [selectedChatId, newMessage, router, buildFilterSearchParams, clearAttachment, draftKey, writeDraft]);

  const handleChatSelect = useCallback((chat: ChatItem) => openChat(chat.id, chat.accountId), [openChat]);

  // Resultado de "En mensajes". En el chat abierto: si el mensaje ya está
  // cargado solo se ilumina; si no, se recarga la ventana alrededor. En otro
  // chat: se abre con el salto pendiente (lo consume el efecto de carga).
  const openMessageHit = useCallback(async (hit: MessageSearchHit) => {
    if (hit.chatId !== selectedChatId) {
      jumpRef.current = { chatId: hit.chatId, messageId: hit.messageId };
      openChat(hit.chatId, hit.accountId, hit.messageId);
      return;
    }
    if (messages.some((m) => m.id === hit.messageId)) {
      setFocusMessageId(hit.messageId);
      return;
    }
    try {
      const res = await fetch(`/api/whatsapp/chats/${hit.chatId}/messages?around=${encodeURIComponent(hit.messageId)}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(typeof data?.error === "string" ? data.error : "No se pudo saltar al mensaje");
      skipAutoScrollRef.current = true;
      setMessages(data);
      setHasOlderMessages(true);
      setFocusMessageId(hit.messageId);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo saltar al mensaje");
    }
  }, [selectedChatId, messages, openChat, toastError]);

  const handleCloseChat = useCallback(() => {
    if (selectedChatId) {
      messageDraftsRef.current.set(selectedChatId, newMessage);
      writeDraft(selectedChatId, newMessage);
    }
    setSelectedChatId(null);
    setNewMessage("");
    setReplyTo(null);
    setCannedResponses([]);
    setCannedIndex(0);
    setInteractiveButtons([]);
    setButtonsPanelOpen(false);
    lastTypingSentRef.current = 0;
    setTypingUsers([]);
    clearAttachment();
    const qs = buildFilterSearchParams().toString();
    router.push(`/whatsapp/chat${qs ? `?${qs}` : ""}`);
  }, [selectedChatId, newMessage, router, clearAttachment, buildFilterSearchParams, writeDraft]);

  function detectMessageType(file: File): "image" | "audio" | "video" | "document" | "sticker" {
    if (isImageMime(file.type)) return "image";
    if (isAudioMime(file.type)) return "audio";
    if (isVideoMime(file.type)) return "video";
    return "document";
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  const handleFileSelected = useCallback((file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toastError("El archivo supera el límite de 20MB");
      return;
    }
    setAttachment(file);
    setAttachmentPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
  }, [toastError]);

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelected(file);
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
            { ...data, replyTo: opts.replyTo ? { id: opts.replyTo.id, direction: opts.replyTo.direction, body: opts.replyTo.body, caption: opts.replyTo.caption, messageType: opts.replyTo.messageType, filename: opts.replyTo.filename, mediaUrl: opts.replyTo.mediaUrl } : null, motionKey: optimistic?.motionKey ?? data.id },
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

  function handleMessageChange(value: string) {
    setNewMessage(value);
    if (!selectedChatId || !value.trim()) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    fetch(`/api/whatsapp/chats/${selectedChatId}/typing`, { method: "POST" }).catch(() => {});
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    // El nombre en revisión NO bloquea el envío: Meta solo rechaza citar
    // (131037), y eso ya lo controlan quoteEnabled y la ruta /send.
    if (sending) return;
    if (!newMessage.trim() && !attachment && interactiveButtons.length === 0) return;
    if (interactiveButtons.length > 0 && (!newMessage.trim() || interactiveButtons.some((title) => !title.trim()))) return;
    if (!selectedChatId || !selectedChat) return;

    const tempId = `temp-${crypto.randomUUID()}`;
    const text = newMessage;
    const file = attachment;
    const filePreviewUrl = file ? attachmentPreview : null;
    const buttons = interactiveButtons;
    const quotedMessage = selectedChat.channel === "WHATSAPP" || selectedChat.channel === "TELEGRAM" ? replyTo : null;

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
      replyTo: quotedMessage ? { id: quotedMessage.id, direction: quotedMessage.direction, body: quotedMessage.body, caption: quotedMessage.caption, messageType: quotedMessage.messageType, filename: quotedMessage.filename, mediaUrl: quotedMessage.mediaUrl } : null,
      timestamp: new Date().toISOString(),
    };

    pendingSendsRef.current.set(tempId, { text, file, filePreviewUrl, buttons, replyTo: quotedMessage });
    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");
    messageDraftsRef.current.delete(selectedChatId);
    const draftStorageKey = draftKey(selectedChatId);
    if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
    lastTypingSentRef.current = 0;
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

  async function handleStatusChange(newStatus: ChatStatus, chatId: string | null = selectedChatId) {
    if (!chatId) return;
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      // F4: faltan atributos obligatorios → se piden y se reintenta. El modal
      // vive junto al hilo: desde el menú contextual se abre ese chat primero.
      if (res.status === 422 && data.code === "required_fields" && Array.isArray(data.fields)) {
        if (chatId !== selectedChatId) {
          const target = chats.find((c) => c.id === chatId);
          if (target) handleChatSelect(target);
        }
        setRequiredPrompt({ chatId, keys: data.fields.map((field: { key: string }) => field.key) });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Error al cambiar estado");
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, status: data.status } : c)));
      return true;
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al cambiar estado");
    }
  }

  // Menú contextual de una fila de la lista (clic derecho / pulsación larga).
  // Mismas rutas que la cabecera del chat y los atajos (lib/inbox/actions.ts).
  async function handleRowAction(chat: ChatItem, action: ChatRowAction) {
    const patch = (fields: Partial<ChatItem>) =>
      setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, ...fields } : c)));
    try {
      switch (action.type) {
        case "open":
          handleChatSelect(chat);
          return;
        case "contact":
          handleChatSelect(chat);
          openContactDrawer(chat.contactId);
          return;
        case "assign": {
          const data = action.userId === "me"
            ? await assignChatToMe(chat.id)
            : await assignChatTo(chat.id, action.userId);
          patch({ assignedToId: data.assignedToId, assignedTo: data.assignedTo });
          toastSuccess(data.assignedTo ? `Asignado a ${data.assignedTo.name ?? "un ejecutivo"}` : "Chat sin asignar");
          return;
        }
        case "priority":
          await setChatPriority(chat.id, action.priority);
          patch({ priority: action.priority });
          return;
        case "snooze": {
          const data = await snoozeChat(chat.id, action.until);
          patch({ snoozedUntil: data.snoozedUntil });
          toastSuccess(action.until ? "Chat pospuesto" : "Ya no está pospuesto");
          return;
        }
        case "status":
          if (await handleStatusChange(action.status, chat.id)) {
            toastSuccess(action.status === "RESOLVED" ? "Chat resuelto" : "Chat reabierto");
          }
          return;
        case "copy-link":
          await navigator.clipboard.writeText(`${window.location.origin}/whatsapp/chat/${chat.accountId}/${chat.id}`);
          toastSuccess("Enlace copiado");
          return;
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo completar la acción");
    }
  }

  function handleAssigned(assignee: { id: string; name: string | null } | null) {
    if (!selectedChatId) return;
    setChats((prev) => prev.map((c) =>
      c.id === selectedChatId ? { ...c, assignedTo: assignee, assignedToId: assignee?.id ?? null } : c
    ));
  }

  function handlePriorityChange(priority: ChatPriority) {
    if (!selectedChatId) return;
    setChats((prev) => prev.map((c) => c.id === selectedChatId ? { ...c, priority } : c));
  }

  function handleSnoozedChange(snoozedUntil: string | null) {
    if (!selectedChatId) return;
    setChats((prev) => prev.map((c) => c.id === selectedChatId ? { ...c, snoozedUntil } : c));
  }

  function setContactParam(contactId: string | null) {
    const params = new URLSearchParams(window.location.search);
    if (contactId) params.set("contacto", contactId);
    else {
      params.delete("contacto");
      params.delete("ficha");
    }
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }

  function openContactDrawer(contactId: string | null) {
    if (!contactId) return;
    setContactDrawerContactId(contactId);
    setContactParam(contactId);
  }

  function closeContactDrawer() {
    setContactDrawerContactId(null);
    setContactParam(null);
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      if (current) setSelectedChatIds(new Set());
      return !current;
    });
  }

  function toggleSelected(chatId: string) {
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }

  async function handleBulkAction(action: ChatBulkAction) {
    if (selectedChatIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/whatsapp/chats/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatIds: Array.from(selectedChatIds), action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al actualizar chats");
      toastSuccess(`${data.updated ?? selectedChatIds.size} chat(s) actualizados`);
      if (data.skipped) toastError(`${data.skipped} chat(s) no se resolvieron: les faltan atributos obligatorios`);
      setSelectedChatIds(new Set());
      setSelectionMode(false);
      await refreshChats();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al actualizar chats");
    } finally {
      setBulkBusy(false);
    }
  }

  function applySavedView(query: string) {
    const params = new URLSearchParams(query);
    setAccountFilter(params.get("accountId") ?? "");
    setCampaignFilter(params.get("campaignId") ?? "");
    const replied = params.get("hasReplied");
    setHasRepliedFilter(replied === "yes" || replied === "no" ? replied : "");
    const assigned = params.get("assigned");
    setAssignedFilter(assigned === "me" || assigned === "unassigned" ? assigned : "");
    const priority = params.get("priority");
    setPriorityFilter(priority === "LOW" || priority === "NORMAL" || priority === "HIGH" || priority === "URGENT" ? priority : "");
    const snoozed = params.get("snoozed");
    setSnoozedFilter(snoozed === "only" || snoozed === "all" ? snoozed : "");
    setAwaitingFilter(params.get("awaiting") === "1");
    const q = params.get("search") ?? "";
    setSearch(q);
    setDebouncedSearch(q);
    setSelectedChatIds(new Set());
    setSelectionMode(false);
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
  const now = useNowMs();
  const filteredChats = chats.filter((c) => {
    if (accountFilter && c.accountId !== accountFilter) return false;
    const snoozed = c.snoozedUntil ? new Date(c.snoozedUntil).getTime() > now : false;
    if (snoozedFilter === "only" && !snoozed) return false;
    // El chat abierto se conserva aunque se acabe de posponer: cerrar el hilo
    // de golpe al pulsar "Posponer" sería peor que verlo con su reloj.
    if (snoozedFilter === "" && snoozed && c.id !== selectedChatId) return false;
    if (assignedFilter === "me" && currentUserId && c.assignedToId !== currentUserId) return false;
    if (assignedFilter === "unassigned" && c.assignedToId) return false;
    if (priorityFilter && c.priority !== priorityFilter) return false;
    // Igual que el snooze: el chat abierto no desaparece al contestarlo.
    if (awaitingFilter && !c.waitingSince && c.id !== selectedChatId) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.name?.toLowerCase().includes(q)) ||
      c.remoteJid.includes(q) ||
      c.lastMessage?.toLowerCase().includes(q)
    );
  });

  const groupedChats: Record<string, ChatItem[]> = {};
  for (const c of filteredChats) {
    const key = c.account.id;
    if (!groupedChats[key]) groupedChats[key] = [];
    groupedChats[key].push(c);
  }
  // Orden visual de la lista (agrupada por cuenta) para Alt+J / Alt+K.
  const visibleChats = Object.values(groupedChats).flat();

  async function runShortcut(action: InboxShortcutAction) {
    if (action === "help") return setShortcutsOpen(true);
    if (action === "focus-search") {
      document.querySelector<HTMLInputElement>("[data-inbox-search]")?.focus();
      return;
    }
    if (action === "next-chat" || action === "prev-chat") {
      const index = adjacentIndex(visibleChats.map((c) => c.id), selectedChatId, action === "next-chat" ? 1 : -1);
      if (index !== null) handleChatSelect(visibleChats[index]);
      return;
    }
    if (!selectedChatId) return;
    const chatId = selectedChatId;
    try {
      if (action === "resolve") {
        await handleStatusChange("RESOLVED");
      } else if (action === "assign-me") {
        const data = await assignChatToMe(chatId);
        setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, assignedToId: data.assignedToId, assignedTo: data.assignedTo } : c)));
        toastSuccess("Chat asignado");
      } else if (action === "snooze-1h") {
        const data = await snoozeChat(chatId, oneHourFromNow());
        setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, snoozedUntil: data.snoozedUntil } : c)));
        toastSuccess("Chat pospuesto 1 hora");
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo completar la acción");
    }
  }
  // Atajos de teclado (lib/inbox/shortcuts.ts). Sin array de dependencias a
  // propósito: se vuelve a registrar en cada render con los handlers vigentes.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = matchInboxShortcut(event);
      if (!action) return;
      const target = event.target as HTMLElement | null;
      const typing = isTypingTarget(target ? { tagName: target.tagName, isContentEditable: target.isContentEditable, role: target.getAttribute("role") } : null);
      const dialogOpen = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
      if (!shouldHandleShortcut(action, { typing, dialogOpen })) return;
      event.preventDefault();
      void runShortcut(action);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });


  const cannedQuery = newMessage.startsWith("/") && !newMessage.includes(" ")
    ? newMessage.slice(1).toLowerCase()
    : null;
  const cannedSuggestions = cannedQuery !== null
    ? cannedResponses.filter((c) => c.shortcut.startsWith(cannedQuery)).slice(0, 6)
    : [];

  // {{nombre}}, {{agente}} y {{negocio}} se resuelven al insertar: el agente
  // ve el texto final (y cualquier variable desconocida) antes de mandarlo.
  function insertCannedResponse(content: string) {
    setNewMessage(
      renderCannedResponse(content, {
        contactName: selectedChat?.name ?? null,
        remoteJid: selectedChat?.remoteJid ?? "",
        agentName: session?.user?.name ?? null,
        businessName,
      })
    );
    setCannedIndex(0);
  }

  const currentViewQuery = buildFilterSearchParams().toString();
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
        campaigns={campaigns}
        campaignFilter={campaignFilter}
        onCampaignFilterChange={setCampaignFilter}
        hasRepliedFilter={hasRepliedFilter}
        onHasRepliedFilterChange={setHasRepliedFilter}
        assignedFilter={assignedFilter}
        onAssignedFilterChange={setAssignedFilter}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        snoozedFilter={snoozedFilter}
        onSnoozedFilterChange={setSnoozedFilter}
        awaitingFilter={awaitingFilter}
        onAwaitingFilterChange={setAwaitingFilter}
        selectionMode={selectionMode}
        onToggleSelectionMode={toggleSelectionMode}
        selectedChatIds={selectedChatIds}
        onToggleSelect={toggleSelected}
        onBulkAction={handleBulkAction}
        onRowAction={(chat, action) => void handleRowAction(chat, action)}
        currentUserId={currentUserId}
        bulkBusy={bulkBusy}
        currentViewQuery={currentViewQuery}
        onApplyView={applySavedView}
        loadingChats={loadingChats}
        loadError={chatsError}
        onRetry={retryChats}
        totalChatsLoaded={chats.length}
        groupedChats={groupedChats}
        chatsTotal={chatsTotal}
        loadingMoreChats={loadingMoreChats}
        onLoadMore={loadMoreChats}
        messageResults={search.trim() ? <MessageSearchResults query={search} onOpen={openMessageHit} /> : null}
      />
  );

  const conversationPane = (
      <div className={`${selectedChatId ? "flex" : "hidden lg:flex"} flex-col flex-1 min-w-0 bg-background`}>
        {!selectedChatId ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Selecciona un chat"
              description={chats.length === 0 ? "Conecta un canal para empezar a recibir mensajes." : "Elige una conversación de la lista para ver los mensajes."}
            />
          </div>
        ) : selectedChat ? (
          <>
            <ChatThreadPanel
              selectedChat={selectedChat}
              messages={messages}
              focusMessageId={focusMessageId}
              onFocusHandled={() => setFocusMessageId(null)}
              typingUsers={typingUsers}
              loadingMessages={loadingMessages}
              hasOlderMessages={hasOlderMessages}
              loadingOlder={loadingOlder}
              onLoadOlder={loadOlderMessages}
              onCloseChat={handleCloseChat}
              onOpenContactDrawer={() => openContactDrawer(selectedChat.contactId)}
              onStatusChange={async (status) => { await handleStatusChange(status); }}
              onAssigned={handleAssigned}
              onPriorityChange={handlePriorityChange}
              onSnoozedChange={handleSnoozedChange}
              onMacroApplied={() => void refreshChats()}
              onPreview={setPreviewMedia}
              onRetry={handleRetry}
              onReply={setReplyTo}
              canQuote={selectedChat.channel === "TELEGRAM" || quoteEnabled}
              canReact={selectedChat.channel === "TELEGRAM" || !displayNameBlocked}
              onReaction={(id, reaction) => setMessages((previous) => previous.map((message) => message.id === id ? { ...message, agentReactions: [reaction] } : message))}
              messagesContainerRef={messagesContainerRef}
              messagesEndRef={messagesEndRef}
            />
            {displayNameBlocked && <ChatDisplayNameBanner />}
            {selectedChat.channel === "WHATSAPP" && serviceWindow && (
              <ChatWindowBanner window={serviceWindow} onSendTemplate={() => setTemplatePickerOpen(true)} />
            )}
            {selectedChat.channel === "WHATSAPP" && templatePickerOpen && (
              <TemplatePickerModal
                key={selectedChat.id}
                open={templatePickerOpen}
                onClose={() => setTemplatePickerOpen(false)}
                chatId={selectedChat.id}
                accountId={selectedChat.accountId}
                contactName={selectedChat.name || ""}
                windowOpen={serviceWindow?.open ?? false}
                onSent={(message) => {
                  setMessages((prev) => [...prev.filter((m) => m.id !== message.id), { ...message, motionKey: message.id, animateOnMount: true }]);
                  refreshChats();
                }}
              />
            )}
            {!selectedChat.assignedToId && selectedChat.status !== "RESOLVED" && (
              <ChatClaimBanner chatId={selectedChat.id} onAssigned={handleAssigned} />
            )}
            <ChatComposer
              signature={signature}
              onOpenTemplates={selectedChat.channel === "WHATSAPP" ? () => setTemplatePickerOpen(true) : undefined}
              chatId={selectedChat.id}
              channel={selectedChat.channel}
              newMessage={newMessage}
              onMessageChange={handleMessageChange}
              sending={sending}
              onSubmit={handleSend}
              onSendSticker={sendSticker}
              replyTo={replyTo}
              leadName={displayName(selectedChat.name, selectedChat.remoteJid)}
              onCancelReply={() => setReplyTo(null)}
              attachment={attachment}
              attachmentPreview={attachmentPreview}
              onPickFile={pickFile}
              onFileChosen={onFileChosen}
              onFileSelected={handleFileSelected}
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
          <div className="flex-1 flex items-center justify-center">
            <EmptyState icon={MessageSquare} title="Chat no encontrado" description="Esta conversación no está disponible para tu cuenta." />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Spinner />
          </div>
        )}
      </div>
  );

  return (
    <div className="flex flex-1 min-h-0">
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {requiredPrompt && requiredPrompt.chatId === selectedChatId && (
        <RequiredFieldsModal
          chatId={requiredPrompt.chatId}
          missingKeys={requiredPrompt.keys}
          onClose={() => setRequiredPrompt(null)}
          onSavedRetry={async () => {
            setRequiredPrompt(null);
            await handleStatusChange("RESOLVED");
          }}
        />
      )}
      <ChatAccountRail accounts={accountOptions} selectedAccountId={accountFilter} onSelect={setAccountFilter} unreadByAccount={unreadByAccount} />
      {resizable ? <Group orientation="horizontal" className="h-full min-w-0 flex-1">
        <Panel id="conversations" defaultSize="32%" minSize="220px" maxSize="48%" className="flex min-w-0">{listPane}</Panel>
        <Separator aria-label="Ajustar ancho de conversaciones" className="group relative w-2 shrink-0 bg-background hover:bg-accent-subtle focus-visible:bg-accent-subtle">
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-accent-strong group-focus-visible:bg-accent-strong" />
        </Separator>
        <Panel id="conversation" defaultSize="68%" minSize="300px" className="flex min-w-0">{conversationPane}</Panel>
      </Group> : <>{listPane}{conversationPane}</>}

      {/* Drawers */}
      {contactDrawerContactId && (
        <ContactDrawer
          contactId={contactDrawerContactId}
          onClose={closeContactDrawer}
          onUpdated={refreshChats}
        />
      )}

      <MediaPreviewModal media={previewMedia} onClose={() => setPreviewMedia(null)} />
    </div>
  );
}
