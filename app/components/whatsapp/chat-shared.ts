// Tipos, constantes y helpers puros compartidos entre chat-workspace.tsx y
// los paneles en los que se dividió (chat-account-rail, chat-list-panel,
// chat-thread-panel, chat-composer) — sin "use client", sin hooks, para que
// cualquiera de los paneles pueda importarlo sin acoplarse a los demás.

import type { StructuredContent } from "@/lib/whatsapp/message-content";

export const CHATS_PAGE_SIZE = 30;
// Cada cuánto sincroniza la bandeja con GET /api/inbox/sync (lista, hilo
// abierto, "está escribiendo" y, cada 6 ticks, contadores de vistas).
export const INBOX_SYNC_MS = 5_000;
// El sync pide el hilo desde el N.º mensaje más reciente cargado: llegan los
// nuevos y los cambios de estado (entregado/leído) de los últimos N.
export const THREAD_SYNC_WINDOW = 20;
// Hilos que la bandeja guarda en memoria para reabrirlos al instante.
export const THREAD_CACHE_MAX = 15;

export type ChatStatus = "OPEN" | "PENDING" | "RESOLVED";

export const STATUS_BADGE: Record<ChatStatus, { label: string; tone: "info" | "warning" | "success" }> = {
  OPEN: { label: "Abierto", tone: "info" },
  PENDING: { label: "Pendiente", tone: "warning" },
  RESOLVED: { label: "Resuelto", tone: "success" },
};

export type ChatPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

// El color va en el punto/flag de la fila; NORMAL no pinta nada para no
// llenar la bandeja de señales que no aportan.
export const PRIORITY_META: Record<ChatPriority, { label: string; dot: string; text: string }> = {
  LOW: { label: "Baja", dot: "bg-muted-darker", text: "text-muted" },
  NORMAL: { label: "Normal", dot: "bg-muted-darker", text: "text-muted" },
  HIGH: { label: "Alta", dot: "bg-warning", text: "text-warning" },
  URGENT: { label: "Urgente", dot: "bg-danger", text: "text-danger" },
};

export const PRIORITY_OPTIONS: Array<{ value: ChatPriority; label: string }> = [
  { value: "LOW", label: "Baja" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
];

/** Acción del menú contextual de una fila de la lista de chats. */
export type ChatRowAction =
  | { type: "open" }
  | { type: "contact" }
  | { type: "assign"; userId: "me" | string | null }
  | { type: "priority"; priority: ChatPriority }
  | { type: "snooze"; until: string | null }
  | { type: "status"; status: ChatStatus }
  | { type: "copy-link" };

export type ChatBulkAction =
  | { type: "assign"; self?: boolean; assignedToId?: string | null }
  | { type: "status"; status: "OPEN" | "RESOLVED" }
  | { type: "priority"; priority: ChatPriority }
  | { type: "snooze"; until: string | null };

export function snoozeUntilFor(preset: "1h" | "tomorrow" | "week"): string {
  const date = new Date();
  if (preset === "1h") {
    date.setHours(date.getHours() + 1);
  } else if (preset === "tomorrow") {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
  } else {
    date.setDate(date.getDate() + 7);
    date.setHours(9, 0, 0, 0);
  }
  return date.toISOString();
}

export function formatSnoozeUntil(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

export type Channel = "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT" | "WHATSAPP_WEB";

export interface AccountOption {
  id: string;
  name: string;
  phoneNumber: string | null;
  channel?: Channel;
}

export interface ChatItem {
  id: string;
  accountId: string;
  remoteJid: string;
  name: string | null;
  isGroup: boolean;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  contactId: string | null;
  status: ChatStatus;
  priority: ChatPriority;
  snoozedUntil: string | null;
  /** Desde cuándo el cliente espera respuesta (lib/chats/waiting.ts). */
  waitingSince?: string | null;
  /** Estado del lead del contacto: la estación de la venta en la cabecera. */
  leadStatus?: "NEW" | "CONTACTED" | "QUALIFIED" | "CUSTOMER" | "LOST" | null;
  /** Fuera de SLA ahora (lib/sla/rules.ts:slaBreachFlags). */
  sla?: { responseBreached: boolean; resolutionBreached: boolean };
  /** Equipo que atiende el chat (lib/teams/). */
  teamId?: string | null;
  team?: { id: string; name: string } | null;
  assignedToId: string | null;
  assignedTo: { id: string; name: string | null } | null;
  account: { id: string; name: string; phoneNumber: string | null; coexistence?: boolean; callingEnabled?: boolean };
  campaign: { id: string; name: string } | null;
  channel: Channel;
  /** Cursor de la sincronización: el más reciente que ya tenemos. */
  updatedAt?: string;
}

/** El updatedAt más reciente de la lista (ISO en UTC: se comparan como texto). */
export function latestUpdatedAt(chats: Array<{ updatedAt?: string }>): string | null {
  let latest: string | null = null;
  for (const chat of chats) if (chat.updatedAt && (!latest || chat.updatedAt > latest)) latest = chat.updatedAt;
  return latest;
}

/** El lastMessageAt más antiguo de la lista: el piso del delta de la sincronización. */
export function oldestLastMessageAt(chats: Array<{ lastMessageAt: string | null }>): string | null {
  let oldest: string | null = null;
  for (const chat of chats) if (chat.lastMessageAt && (!oldest || chat.lastMessageAt < oldest)) oldest = chat.lastMessageAt;
  return oldest;
}

export type ViewCounts = Record<"awaiting" | "mine" | "unassigned" | "all", number> & { sla?: number; teams?: number; snoozed?: number };

/** Respuesta de GET /api/inbox/sync. */
export interface InboxSyncResponse {
  chats: ChatItem[];
  total?: number;
  thread?: { chatId: string; messages: Message[]; typing: Array<{ id: string; name: string | null }> } | { chatId: string; missing: true };
  counts?: ViewCounts;
}

export interface CannedResponseItem {
  id: string;
  shortcut: string;
  content: string;
}

export interface CampaignOption {
  id: string;
  name: string;
}

export const HAS_REPLIED_OPTIONS: Array<{ value: "" | "yes" | "no"; label: string }> = [
  { value: "", label: "Todos los chats" },
  { value: "yes", label: "Con respuesta del contacto" },
  { value: "no", label: "Sin respuesta del contacto" },
];

export interface AgentReaction { id: string; emoji: string; status: string; error: string | null }

export interface Message {
  id: string;
  wamid?: string | null;
  direction: "INBOUND" | "OUTBOUND";
  messageType: string;
  body: string | null;
  caption: string | null;
  mediaId: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  filename: string | null;
  bytesSize: number | null;
  /** Transcripción de una nota de voz (lib/ai/transcribe.ts). */
  transcript?: string | null;
  status: string | null;
  /** Motivo en español de un envío rechazado por Meta (solo WhatsApp). */
  errorMessage?: string | null;
  errorCode?: number | null;
  replyToWamid?: string | null;
  replyTo?: { id: string; direction: "INBOUND" | "OUTBOUND"; body: string | null; caption: string | null; messageType: string; filename?: string | null; mediaUrl?: string | null } | null;
  reactionEmoji?: string | null;
  agentReactionEmoji?: string | null;
  agentReactions?: AgentReaction[];
  /** Contenido estructurado de WhatsApp (lib/whatsapp/message-content.ts:structuredContentOf). */
  content?: Pick<StructuredContent, "location" | "flowResponse" | "order" | "contacts"> | null;
  timestamp: string;
  /** Identidad visual estable mientras el envío optimista recibe su id real. */
  motionKey?: string;
  /** Solo los mensajes nuevos entran animados; el historial cargado no. */
  animateOnMount?: boolean;
  /** Solo en mensajes optimistas locales (id "temp-…"): preview del archivo
   *  adjunto antes de que exista un mediaId real servido por el proxy. */
  localPreviewUrl?: string;
  /** Botones enviados (outbound, messageType "interactive") o id de la
   *  respuesta recibida (inbound) — ver lib/whatsapp/send-interactive.ts. */
  interactivePayload?: { buttons?: { id: string; title: string; description?: string }[]; replyId?: string } | null;
  /** Roadmap P3-c — true si este INBOUND vino de un comentario de Facebook
   *  Page, no de un mensaje directo. Solo aplica a Messenger. */
  isFromComment?: boolean;
  /** Grupo de WhatsApp por QR: quién del grupo escribió este entrante. */
  senderName?: string | null;
}

export interface PreviewMedia {
  type: "image" | "video";
  src: string;
  filename: string | null;
  mimeType: string | null;
}

// Medio del historial de Coexistencia que nunca llegó (messageType
// `media_placeholder`, body `[media_placeholder]`).
export const HISTORY_MEDIA_LABEL = "Archivo del historial";

// `[interactive]` es la etiqueta interna cuando el aviso de WhatsApp no trajo
// el texto del mensaje con botones. En la interfaz se lee así.
export function displayMessageText(body: string | null | undefined): string | null {
  if (!body) return null;
  if (body === "[interactive]") return "Mensaje con botones";
  if (body === "[media_placeholder]") return HISTORY_MEDIA_LABEL;
  return body;
}

// Texto corto para una cita o un preview. Los medios sin caption no tienen
// body: antes se citaban como "[document]"/"[image]"; ahora se usa el nombre
// del archivo o una etiqueta legible.
export function messagePreview(message: {
  messageType: string;
  body?: string | null;
  caption?: string | null;
  filename?: string | null;
}): string {
  const raw = displayMessageText(message.body);
  const placeholder = raw ? /^\[(image|video|audio|document|sticker)\]$/i.test(raw) : true;
  const text = !placeholder ? raw : message.caption?.trim() || null;
  if (text) return text;
  switch (message.messageType) {
    case "image": return "Imagen";
    case "video": return "Video";
    case "audio": return "Audio";
    case "sticker": return "Sticker";
    case "document": return message.filename ?? "Documento";
    case "interactive": return "Mensaje con botones";
    case "template": return "Plantilla";
    case "media_placeholder": return HISTORY_MEDIA_LABEL;
    default: return `[${message.messageType}]`;
  }
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return d.toLocaleDateString("es-MX", { weekday: "short" });
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

// Bubbles always show a clock time (unlike the sidebar preview's formatTime,
// which shows a date for older chats) — a day divider carries the date instead,
// so a message from last week doesn't just silently lose its time-of-day.
export function formatBubbleTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function formatDayDivider(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Deterministic per-account color so the same number always reads with the
// same tone across the sidebar groups and the thread header, letting an agent
// juggling multiple WhatsApp numbers tell them apart at a glance.
const ACCOUNT_TONES = ["info", "success", "warning", "danger", "accent"] as const;
type AccountTone = (typeof ACCOUNT_TONES)[number];
function hashTone(id: string): AccountTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ACCOUNT_TONES[hash % ACCOUNT_TONES.length];
}
// Separate name at call sites for readability — the badge doesn't get its own
// color pool (Tailwind literals aside, 5 semantic tones is already what the
// design system offers); a campaign badge always carries its name as text, so
// a same-tone collision between two campaigns is still unambiguous.
export const campaignTone = hashTone;
// El punto/nombre del grupo por cuenta usa el sistema hue-N (8 colores por
// entidad, ver lib hue.ts + globals.css) — mismo color que el EntityAvatar de
// cada fila, para que el inbox multi-cuenta se lea de un vistazo. Los Badge
// (campaña/cuenta en el header del hilo) siguen con los 5 tonos semánticos.

/** Enlace universal a un mapa: en el teléfono abre la app de mapas. */
export function mapUrlFor(location: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
}
