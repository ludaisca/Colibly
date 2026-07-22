"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/app/components/ui/empty-state";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { ContactDrawer } from "@/app/components/whatsapp/contact-drawer";
import { ChatAccountRail } from "@/app/components/whatsapp/chat-account-rail";
import { ChatListPanel } from "@/app/components/whatsapp/chat-list-panel";
import { ChatThreadPanel, MediaPreviewModal } from "@/app/components/whatsapp/chat-thread-panel";
import { ChatComposer } from "@/app/components/whatsapp/chat-composer";
import { isImageMime, isAudioMime, isVideoMime } from "@/lib/whatsapp/media-shared";
import {
  CHATS_PAGE_SIZE,
  type ChatItem,
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

interface ChatWorkspaceProps {
  initialAccountId?: string;
  initialChatId?: string;
  initialCampaignId?: string;
  initialHasReplied?: "" | "yes" | "no";
  initialSearch?: string;
}

export function ChatWorkspace({
  initialAccountId,
  initialChatId,
  initialCampaignId,
  initialHasReplied,
  initialSearch,
}: ChatWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { error: toastError } = useToast();

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMoreChats, setLoadingMoreChats] = useState(false);
  const [chatsTotal, setChatsTotal] = useState(0);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState(initialSearch || "");
  // La búsqueda va al servidor (la lista está paginada — filtrar solo lo
  // cargado escondía chats antiguos); el debounce evita un fetch por tecla.
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch || "");
  const [accountFilter, setAccountFilter] = useState(initialAccountId || "");
  const [campaignFilter, setCampaignFilter] = useState(initialCampaignId || "");
  const [hasRepliedFilter, setHasRepliedFilter] = useState<"" | "yes" | "no">(initialHasReplied || "");
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null);
  const [cannedResponses, setCannedResponses] = useState<CannedResponseItem[]>([]);
  // Sugerencia de respuesta rápida resaltada — navegable con ↑/↓, se inserta
  // con Enter o Tab.
  const [cannedIndex, setCannedIndex] = useState(0);

  // Media attachments state
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // scrollHeight previo a un prepend de historial — permite restaurar la
  // posición de lectura en vez de que el contenido "salte" hacia abajo.
  const prependHeightRef = useRef<number | null>(null);
  // Payload original de cada mensaje optimista, por tempId — permite
  // reintentar un envío fallido sin pedirle al usuario que lo reescriba.
  const pendingSendsRef = useRef<Map<string, { text: string; file: File | null; filePreviewUrl: string | null }>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildChatsParams = useCallback((page: number, pageSize: number): URLSearchParams => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (campaignFilter) params.set("campaignId", campaignFilter);
    if (hasRepliedFilter) params.set("hasReplied", hasRepliedFilter);
    if (accountFilter) params.set("accountId", accountFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params;
  }, [campaignFilter, hasRepliedFilter, accountFilter, debouncedSearch]);

  // Mezcla /api/whatsapp/chats + /api/telegram/chats en una sola página
  // ordenada por lastMessageAt. No es paginación combinada real a nivel de
  // DB (cada fuente pagina por su cuenta y se fusiona en el cliente) — con
  // el volumen de chats esperado por cuenta esto es suficiente y evita una
  // vista SQL que uniera ambas tablas. Cuando el filtro de cuenta activo
  // apunta a un solo canal, la otra fuente se omite (evita un 404 de "cuenta
  // no encontrada" al pasarle un id que no le pertenece, y ahorra el fetch).
  // waPage/tgPage van por separado a propósito: cada fuente pagina sobre su
  // propio total, así que derivar una sola página del total mezclado saltaba
  // registros (con 40 chats en cada canal, la primera página traía 30+30=60 y
  // la siguiente pedía la página 3 de ambos — vacía en las dos, dejando 20
  // chats inalcanzables y el botón "Cargar más" visible para siempre).
  const fetchChatsPage = useCallback(async (waPage: number, tgPage: number, pageSize: number): Promise<{ items: ChatItem[]; total: number }> => {
    const selectedAccountChannel = accountFilter ? accounts.find((a) => a.id === accountFilter)?.channel : undefined;
    const skipWhatsapp = selectedAccountChannel === "TELEGRAM";
    const skipTelegram = !!campaignFilter || selectedAccountChannel === "WHATSAPP";

    const tgParams = new URLSearchParams({ page: String(tgPage), pageSize: String(pageSize) });
    if (hasRepliedFilter) tgParams.set("hasReplied", hasRepliedFilter);
    if (accountFilter) tgParams.set("accountId", accountFilter);
    if (debouncedSearch) tgParams.set("search", debouncedSearch);

    const [waData, tgData] = await Promise.all([
      skipWhatsapp
        ? Promise.resolve({ items: [] as ChatItem[], total: 0 })
        : fetch(`/api/whatsapp/chats?${buildChatsParams(waPage, pageSize)}`).then((r) => r.json()),
      skipTelegram
        ? Promise.resolve({ items: [] as ChatItem[], total: 0 })
        : fetch(`/api/telegram/chats?${tgParams}`).then((r) => r.json()),
    ]);

    const items = [...(Array.isArray(waData.items) ? waData.items : []), ...(Array.isArray(tgData.items) ? tgData.items : [])]
      .sort((a, b) => {
        const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bt - at;
      });
    const total = (waData.total ?? 0) + (tgData.total ?? 0);
    return { items, total };
  }, [accountFilter, accounts, campaignFilter, hasRepliedFilter, debouncedSearch, buildChatsParams]);

  const refreshChats = useCallback(async () => {
    try {
      const pageSize = Math.min(Math.max(chats.length, CHATS_PAGE_SIZE), 100);
      const { items, total } = await fetchChatsPage(1, 1, pageSize);
      setChats(items);
      setChatsTotal(total);
    } catch {
      toastError("Error al cargar chats");
    }
  }, [chats.length, fetchChatsPage, toastError]);

  const loadMoreChats = useCallback(async () => {
    setLoadingMoreChats(true);
    try {
      // La página se calcula por canal según cuántos de sus chats ya hay en
      // memoria. Cuando ese conteo no es múltiplo del tamaño de página, la
      // petición vuelve a traer algunos ya cargados — de ahí el dedupe por id
      // al anexar, que además cubre los que el polling haya insertado ya.
      const waLoaded = chats.filter((c) => c.channel === "WHATSAPP").length;
      const tgLoaded = chats.filter((c) => c.channel === "TELEGRAM").length;
      const { items, total } = await fetchChatsPage(
        Math.floor(waLoaded / CHATS_PAGE_SIZE) + 1,
        Math.floor(tgLoaded / CHATS_PAGE_SIZE) + 1,
        CHATS_PAGE_SIZE
      );
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
  }, [chats, fetchChatsPage, toastError]);

  // Handle URL changes to update state — tracked via a "previous prop" render-time
  // comparison (same idiom as Modal/Drawer's open/prevOpen) instead of an effect,
  // since calling setState directly in an effect body causes an extra cascading
  // render for what's really just deriving state from a changed prop.
  const [prevInitialChatId, setPrevInitialChatId] = useState(initialChatId);
  const [prevInitialAccountId, setPrevInitialAccountId] = useState(initialAccountId);
  const [prevInitialCampaignId, setPrevInitialCampaignId] = useState(initialCampaignId);
  const [prevInitialHasReplied, setPrevInitialHasReplied] = useState(initialHasReplied);
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);
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
    return params;
  }, [accountFilter, campaignFilter, hasRepliedFilter, debouncedSearch]);

  useEffect(() => {
    const qs = buildFilterSearchParams().toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo resincroniza cuando cambian los filtros, no en cada render por pathname/router
  }, [accountFilter, campaignFilter, hasRepliedFilter, debouncedSearch]);

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

  // Cuentas para el selector — de la API, no derivadas de los chats cargados:
  // con el filtro de cuenta server-side, los chats en memoria pueden ser de
  // una sola cuenta y el selector perdería las demás opciones. Se mezclan
  // cuentas de WhatsApp y Telegram en una sola lista — el rail/selector no
  // distingue el canal, solo pinta id+nombre+color.
  useEffect(() => {
    Promise.all([
      fetch("/api/whatsapp/accounts").then((r) => r.json()),
      fetch("/api/telegram/accounts").then((r) => r.json()),
    ])
      .then(([wa, tg]) => {
        const waOptions: AccountOption[] = Array.isArray(wa)
          ? wa.map((a: { id: string; name: string; phoneNumber: string | null }) => ({
              id: a.id, name: a.name, phoneNumber: a.phoneNumber ?? null, channel: "WHATSAPP",
            }))
          : [];
        const tgOptions: AccountOption[] = Array.isArray(tg)
          ? tg.map((a: { id: string; name: string }) => ({
              id: a.id, name: a.name, phoneNumber: null, channel: "TELEGRAM",
            }))
          : [];
        setAccounts([...waOptions, ...tgOptions]);
      })
      .catch(() => {});
  }, []);

  // Load initial chats list
  useEffect(() => {
    async function reset() {
      setLoadingChats(true);
      try {
        const { items, total } = await fetchChatsPage(1, 1, CHATS_PAGE_SIZE);
        setChats(items);
        setChatsTotal(total);
      } catch {
        toastError("Error al cargar chats");
      } finally {
        setLoadingChats(false);
      }
    }
    reset();
  }, [fetchChatsPage, toastError]);

  // Derived, not its own state — chats stays the single source of truth so every
  // mutation site only needs to update one place instead of keeping two in sync.
  const selectedChat = chats.find((c) => c.id === selectedChatId) ?? null;

  // Fetch canned responses
  useEffect(() => {
    if (!selectedChat) return;
    fetch(`/api/whatsapp/canned-responses?waAccountId=${selectedChat.accountId}`)
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

    async function load() {
      try {
        const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/messages?limit=50`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setMessages(data);
          setHasOlderMessages(data.length >= 50);
        }
      } catch {
        toastError("Error al cargar mensajes");
      } finally {
        setLoadingMessages(false);
      }
    }
    load();
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
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/messages?limit=50`);
        const data = (await res.json()) as Message[];
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
              if (fresh && (fresh.status !== m.status || fresh.mediaUrl !== m.mediaUrl)) {
                changed = true;
                return fresh;
              }
              return m;
            });
            const known = new Set(prev.map((m) => m.id));
            const appended = data.filter((m) => !known.has(m.id));
            if (!changed && appended.length === 0) return prev;
            anyChange = true;
            return [...merged, ...appended];
          });
          if (anyChange) refreshChats();
        }
      } catch (err) {
        // Poll de 5s: un toast por cada blip de red sería spam — el siguiente
        // tick reintenta solo. Se registra para no perder el diagnóstico.
        console.warn("Fallo el poll de mensajes, se reintenta en 5s", err);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedChatId, refreshChats]);

  // Route updates on selection
  const handleChatSelect = useCallback((chat: ChatItem) => {
    setSelectedChatId(chat.id);
    const qs = buildFilterSearchParams().toString();
    router.push(`/whatsapp/chat/${chat.accountId}/${chat.id}${qs ? `?${qs}` : ""}`);
  }, [router, buildFilterSearchParams]);

  const clearAttachment = useCallback(() => {
    setAttachment(null);
    setAttachmentPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const handleCloseChat = useCallback(() => {
    setSelectedChatId(null);
    clearAttachment();
    const qs = buildFilterSearchParams().toString();
    router.push(`/whatsapp/chat${qs ? `?${qs}` : ""}`);
  }, [router, clearAttachment, buildFilterSearchParams]);

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
    setAttachmentPreview(URL.createObjectURL(file));
    e.target.value = "";
  }

  // Hace el envío real (upload + send o solo send) y resuelve el mensaje
  // optimista `tempId` ya insertado en pantalla: lo reemplaza por el mensaje
  // real que devuelve el servidor, o lo marca "failed" con opción de
  // reintentar. Compartido por el submit del composer y por el botón
  // "Reintentar" de una burbuja fallida.
  const performSend = useCallback(
    async (tempId: string, opts: { text: string; file: File | null; filePreviewUrl: string | null }) => {
      if (!selectedChatId || !selectedChat) return;
      try {
        let data;
        if (opts.file) {
          const uploadForm = new FormData();
          uploadForm.append("file", opts.file);
          uploadForm.append("accountId", selectedChat.accountId);

          const upRes = await fetch(`/api/whatsapp/media`, { method: "POST", body: uploadForm });
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
            }),
          });
          data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Error al enviar");
        } else {
          const res = await fetch(`/api/whatsapp/chats/${selectedChatId}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "text", body: opts.text.trim() }),
          });
          data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Error al enviar");
        }
        // El id real puede ya estar en pantalla si el poll de 5s lo trajo
        // antes que esta respuesta — se descarta cualquier duplicado.
        setMessages((prev) => [...prev.filter((m) => m.id !== tempId && m.id !== data.id), data]);
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
    if (!newMessage.trim() && !attachment) return;
    if (!selectedChatId || !selectedChat) return;

    const tempId = `temp-${crypto.randomUUID()}`;
    const text = newMessage;
    const file = attachment;
    const filePreviewUrl = file ? attachmentPreview : null;

    const optimisticMessage: Message = {
      id: tempId,
      direction: "OUTBOUND",
      messageType: file ? detectMessageType(file) : "text",
      body: file ? null : text.trim(),
      caption: file && text.trim() ? text.trim() : null,
      mediaId: null,
      mediaUrl: file ? "pending" : null,
      localPreviewUrl: filePreviewUrl ?? undefined,
      mimeType: file?.type ?? null,
      filename: file?.name ?? null,
      bytesSize: file?.size ?? null,
      status: "sending",
      timestamp: new Date().toISOString(),
    };

    pendingSendsRef.current.set(tempId, { text, file, filePreviewUrl });
    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");
    // Reset del composer sin revocar el object URL todavía — la burbuja
    // optimista lo sigue usando hasta que el envío se confirme o falle.
    setAttachment(null);
    setAttachmentPreview(null);

    setSending(true);
    await performSend(tempId, { text, file, filePreviewUrl });
    setSending(false);
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

  const groupedChats: Record<string, ChatItem[]> = {};
  for (const c of filteredChats) {
    const key = c.account.id;
    if (!groupedChats[key]) groupedChats[key] = [];
    groupedChats[key].push(c);
  }

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

  return (
    <div className="flex flex-1 min-h-0">
      <ChatAccountRail
        accounts={accountOptions}
        selectedAccountId={accountFilter}
        onSelect={setAccountFilter}
        unreadByAccount={unreadByAccount}
      />

      <ChatListPanel
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
        loadingChats={loadingChats}
        totalChatsLoaded={chats.length}
        groupedChats={groupedChats}
        chatsTotal={chatsTotal}
        loadingMoreChats={loadingMoreChats}
        onLoadMore={loadMoreChats}
      />

      {/* Main pane - Chat thread */}
      <div className={`${selectedChatId ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0 bg-background`}>
        {!selectedChatId ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Selecciona un chat"
              description={chats.length === 0 ? "Conecta una cuenta de WhatsApp o Telegram para empezar a recibir mensajes." : "Elige una conversación de la lista para ver los mensajes."}
            />
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
              onOpenContactDrawer={() => setContactDrawerOpen(true)}
              onStatusChange={handleStatusChange}
              onAssigned={(assignee) =>
                setChats((prev) => prev.map((c) =>
                  c.id === selectedChatId ? { ...c, assignedTo: assignee, assignedToId: assignee?.id ?? null } : c
                ))
              }
              onPreview={setPreviewMedia}
              onRetry={handleRetry}
              messagesContainerRef={messagesContainerRef}
              messagesEndRef={messagesEndRef}
            />
            <ChatComposer
              newMessage={newMessage}
              onMessageChange={setNewMessage}
              sending={sending}
              onSubmit={handleSend}
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
              attachmentsDisabled={selectedChat.channel === "TELEGRAM"}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Spinner />
          </div>
        )}
      </div>

      {/* Drawers */}
      {contactDrawerOpen && selectedChat?.contactId && (
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
