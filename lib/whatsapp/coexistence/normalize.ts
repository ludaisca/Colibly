import { getMediaInfo, getMessageBody, interactivePayloadOf, parseMessageEdit, structuredContentOf, type StoredInteractivePayload, type StructuredContent, type WhatsAppMessageContent } from "@/lib/whatsapp/message-content";

// Normalizadores PUROS de los webhooks de coexistencia de Meta
// (smb_message_echoes, history, smb_app_state_sync). Reciben el `value` del
// cambio tal cual llega y devuelven estructuras propias; no tocan la base de
// datos. Formas verificadas en la documentación de Meta el 2026-10-03.

export const HISTORY_DECLINED_ERROR_CODE = 2593109;

export type BusinessMessageDirection = "INBOUND" | "OUTBOUND";

export interface NormalizedBusinessMessage {
  wamid: string;
  // Teléfono (solo dígitos) del cliente final de la conversación.
  userPhone: string;
  direction: BusinessMessageDirection;
  timestamp: Date;
  // Tipo de Meta; "media_placeholder" = el historial trae el mensaje sin su
  // contenido (llega aparte en otro webhook, solo para los últimos 14 días).
  type: string;
  body: string;
  mediaId: string | null;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
  interactivePayload: StoredInteractivePayload | null;
  // Ubicación, contactos, pedido, sha256… (igual que el webhook `messages`).
  content: StructuredContent | null;
  // Estado de entrega del historial (SENT, DELIVERED, READ, PLAYED, PENDING, ERROR).
  historyStatus: string | null;
  // Si es la edición de otro mensaje: su wamid. No se guarda como mensaje; el
  // ingest actualiza el original con `body`/`caption`.
  editOf?: string | null;
}

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

// Meta ha usado dos formas para los móviles de México: 52 + 10 dígitos y
// 521 + 10 dígitos. Un eco o un historial puede traer una y el chat existir con
// la otra; al buscar chats/contactos se prueban ambas.
export function jidCandidates(phoneDigits: string): string[] {
  const d = digitsOnly(phoneDigits);
  if (!d) return [];
  const out = new Set<string>([d]);
  if (/^521\d{10}$/.test(d)) out.add("52" + d.slice(3));
  else if (/^52\d{10}$/.test(d)) out.add("521" + d.slice(2));
  return [...out];
}

function toDate(ts: unknown): Date {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}

type RawMessage = Record<string, unknown> & { id?: string; timestamp?: string | number; type?: string; from?: string; to?: string };

function contentOf(raw: RawMessage): Pick<NormalizedBusinessMessage, "type" | "body" | "mediaId" | "mimeType" | "filename" | "caption" | "interactivePayload" | "content" | "editOf"> {
  const type = typeof raw.type === "string" ? raw.type : "unknown";
  const content = { type, [type]: raw[type] } as unknown as WhatsAppMessageContent;
  const edit = parseMessageEdit(content);
  if (edit) {
    return { type, body: edit.body ?? "", mediaId: null, mimeType: null, filename: null, caption: edit.caption, interactivePayload: null, content: null, editOf: edit.originalMessageId };
  }
  // `interactive`/`button` y los tipos con objeto propio ya vienen bajo su
  // nombre; el resto (text, image, …) se lee con las mismas funciones del webhook.
  const { mediaId, mimeType, filename, caption } = getMediaInfo(content);
  return { type, body: getMessageBody(content), mediaId, mimeType, filename, caption, interactivePayload: interactivePayloadOf(content), content: structuredContentOf(content) };
}

// smb_message_echoes: mensajes que el negocio escribió en la app del teléfono
// (o en un dispositivo vinculado) después del alta.
export function normalizeEchoes(value: unknown): NormalizedBusinessMessage[] {
  const echoes = (value as { message_echoes?: RawMessage[] } | null)?.message_echoes;
  if (!Array.isArray(echoes)) return [];
  const out: NormalizedBusinessMessage[] = [];
  for (const raw of echoes) {
    const userPhone = digitsOnly(raw.to);
    if (!raw.id || !userPhone) continue;
    out.push({
      wamid: raw.id,
      userPhone,
      direction: "OUTBOUND",
      timestamp: toDate(raw.timestamp),
      ...contentOf(raw),
      historyStatus: null,
    });
  }
  return out;
}

export type HistoryEnvelope =
  | { kind: "declined" }
  | { kind: "error"; code: number | null; message: string }
  | {
      kind: "chunk";
      phase: number | null;
      chunkOrder: number | null;
      progress: number | null;
      messages: NormalizedBusinessMessage[];
    };

// history: el negocio compartió su historial (180 días, sin grupos) o lo
// rechazó (error 2593109). Un solo webhook puede traer miles de mensajes en
// varios hilos.
export function normalizeHistory(value: unknown): HistoryEnvelope[] {
  const v = value as { metadata?: { display_phone_number?: string }; history?: Array<Record<string, unknown>> } | null;
  const businessPhone = digitsOnly(v?.metadata?.display_phone_number);
  const entries = Array.isArray(v?.history) ? v!.history! : [];
  const out: HistoryEnvelope[] = [];

  for (const entry of entries) {
    const errors = entry.errors as Array<{ code?: number; message?: string; title?: string }> | undefined;
    if (Array.isArray(errors) && errors.length > 0) {
      const declined = errors.find((e) => e.code === HISTORY_DECLINED_ERROR_CODE);
      if (declined) out.push({ kind: "declined" });
      else out.push({ kind: "error", code: errors[0].code ?? null, message: errors[0].message ?? errors[0].title ?? "Error de historial" });
      continue;
    }

    const meta = (entry.metadata ?? {}) as { phase?: number; chunk_order?: number; progress?: number };
    const messages: NormalizedBusinessMessage[] = [];
    const threads = Array.isArray(entry.threads) ? (entry.threads as Array<{ id?: string; messages?: RawMessage[] }>) : [];
    for (const thread of threads) {
      const userPhone = digitsOnly(thread.id);
      if (!userPhone || !Array.isArray(thread.messages)) continue;
      for (const raw of thread.messages) {
        if (!raw.id) continue;
        const outbound = businessPhone !== "" && digitsOnly(raw.from) === businessPhone;
        const ctx = raw.history_context as { status?: string } | undefined;
        messages.push({
          wamid: raw.id,
          userPhone,
          direction: outbound ? "OUTBOUND" : "INBOUND",
          timestamp: toDate(raw.timestamp),
          ...contentOf(raw),
          historyStatus: ctx?.status ?? null,
        });
      }
    }
    out.push({
      kind: "chunk",
      phase: typeof meta.phase === "number" ? meta.phase : null,
      chunkOrder: typeof meta.chunk_order === "number" ? meta.chunk_order : null,
      progress: typeof meta.progress === "number" ? meta.progress : null,
      messages,
    });
  }
  return out;
}

// Contenido de un medio del historial. Meta lo manda DESPUÉS del lote, en otro
// webhook `history` con forma distinta: `value.messages[]` directo (sin
// `history[].threads[]`), con el mismo wamid del `media_placeholder` que ya se
// guardó. Solo para medios de los últimos 14 días. Hasta 2026-11-13 esta forma
// se ignoraba (normalizeHistory solo lee `value.history`) y los medios del
// historial se quedaban como placeholder para siempre.
export interface NormalizedHistoryMedia {
  wamid: string;
  type: string;
  body: string;
  mediaId: string | null;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
}

export function normalizeHistoryMedia(value: unknown): NormalizedHistoryMedia[] {
  const messages = (value as { messages?: RawMessage[] } | null)?.messages;
  if (!Array.isArray(messages)) return [];
  const out: NormalizedHistoryMedia[] = [];
  for (const raw of messages) {
    if (!raw.id || raw.type === "media_placeholder") continue;
    const c = contentOf(raw);
    if (c.editOf) continue;
    out.push({ wamid: raw.id, type: c.type, body: c.body, mediaId: c.mediaId, mimeType: c.mimeType, filename: c.filename, caption: c.caption });
  }
  return out;
}

export interface NormalizedStateSyncContact {
  phone: string;
  fullName: string | null;
  firstName: string | null;
  action: "add" | "remove";
  changedAt: Date;
}

// smb_app_state_sync: altas/ediciones/bajas de contactos de la libreta del
// teléfono del negocio (la sincronización inicial manda todos los existentes).
export function normalizeStateSync(value: unknown): NormalizedStateSyncContact[] {
  const items = (value as { state_sync?: Array<Record<string, unknown>> } | null)?.state_sync;
  if (!Array.isArray(items)) return [];
  const out: NormalizedStateSyncContact[] = [];
  for (const item of items) {
    if (item.type !== "contact") continue;
    const contact = (item.contact ?? {}) as { full_name?: string; first_name?: string; phone_number?: string };
    const phone = digitsOnly(contact.phone_number);
    if (!phone) continue;
    const meta = (item.metadata ?? {}) as { timestamp?: string | number };
    out.push({
      phone,
      fullName: contact.full_name?.trim() || null,
      firstName: contact.first_name?.trim() || null,
      action: item.action === "remove" ? "remove" : "add",
      changedAt: toDate(meta.timestamp),
    });
  }
  return out;
}

// Estado de la sincronización según los porcentajes del historial: Meta marca
// progress = 100 cuando terminó.
export function historyIsComplete(progress: number | null): boolean {
  return progress !== null && progress >= 100;
}

// Mapea el estado de entrega del historial al formato de WAMessage.status.
export function mapHistoryStatus(status: string | null): string | null {
  switch (status) {
    case "SENT": return "sent";
    case "DELIVERED": return "delivered";
    case "READ":
    case "PLAYED": return "read";
    case "ERROR": return "failed";
    default: return null;
  }
}
