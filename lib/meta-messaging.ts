import { httpTimeout, HTTP_TRANSFER_TIMEOUT_MS } from "@/lib/http-timeouts";
import { GRAPH_API_BASE } from "@/lib/meta/graph";

// Cliente núcleo para Messenger e Instagram — ambos comparten el mismo
// Page Access Token y el mismo graph.facebook.com bajo el modelo
// Página-vinculada (confirmado con el usuario, no el Instagram Login
// standalone), así que un solo cliente basta para los dos canales, igual
// que lib/telegram.ts es el único cliente para Telegram.
const GRAPH_API = GRAPH_API_BASE;

async function parseGraphError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new Error(body?.error?.message ?? `${fallback} (HTTP ${res.status})`);
}

export interface SendMessageResult {
  recipientId: string;
  messageId: string;
}

// message_id de Messenger/Instagram no está confirmado como único global
// (a diferencia del wamid de Meta Cloud) — el dedupe de ChannelMessage ya
// está scoped a la conversación (ver lib/telegram/ingest-message.ts), así
// que no hace falta asumirlo aquí.
export async function sendMetaChannelMessage(
  pageAccessToken: string,
  pageId: string,
  recipientId: string,
  message: { text: string; quickReplies?: { id: string; title: string }[] } | { attachmentId: string; mimeType: string }
): Promise<SendMessageResult> {
  const url = `${GRAPH_API}/${pageId}/messages`;

  // quick_replies: botones bajo el mensaje (máx. 13, título máx. 20); el toque
  // llega en el webhook como message.quick_reply.payload = id de la opción.
  const body =
    "text" in message
      ? {
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: {
            text: message.text,
            ...(message.quickReplies?.length
              ? { quick_replies: message.quickReplies.slice(0, 13).map((q) => ({ content_type: "text", title: q.title.slice(0, 20), payload: q.id })) }
              : {}),
          },
        }
      : {
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: { attachment: { type: attachmentTypeFromMime(message.mimeType), payload: { attachment_id: message.attachmentId } } },
        };

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${pageAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: httpTimeout(),
  });

  if (!res.ok) await parseGraphError(res, "Send message failed");

  const data = await res.json();
  return { recipientId: data.recipient_id, messageId: data.message_id };
}

// Roadmap P3-c — Private Reply: la ÚNICA forma de mandarle un mensaje
// privado a alguien que solo comentó una publicación (nunca abrió un DM) es
// este endpoint dedicado con el comment_id como destinatario, no el Send
// API normal con un PSID (Meta lo rechaza sin un hilo de Messenger ya
// abierto). Válido solo para la PRIMERA respuesta — una vez que Meta abre
// el hilo, las respuestas siguientes usan sendMetaChannelMessage() normal
// con el mismo PSID (ver isFirstResponse en chats/[chatId]/send).
export async function sendPrivateReplyToComment(
  pageAccessToken: string,
  commentId: string,
  text: string
): Promise<SendMessageResult> {
  const url = `${GRAPH_API}/${commentId}/private_replies`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${pageAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
    signal: httpTimeout(),
  });

  if (!res.ok) await parseGraphError(res, "Private reply failed");

  const data = await res.json();
  // Meta no documenta recipient_id en la respuesta de este endpoint (a
  // diferencia de /messages) — se deja vacío, ningún llamador lo usa hoy.
  return { recipientId: "", messageId: data.message_id ?? data.id ?? "" };
}

function attachmentTypeFromMime(mimeType: string): "image" | "video" | "audio" | "file" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

export interface UploadedAttachment {
  attachmentId: string;
}

// Two-step obligatorio (a diferencia de Telegram, que sube en el mismo call
// de envío): nuestra media vive en disco local, no en una URL pública, así
// que la alternativa de Meta (payload.url que Meta fetchea) no aplica sin
// exponer el storage a internet. is_reusable:true permite reusar el mismo
// attachment_id si se reenvía (no se reusa hoy, pero no cuesta nada pedirlo).
export async function uploadMetaAttachment(
  pageAccessToken: string,
  pageId: string,
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<UploadedAttachment> {
  const url = `${GRAPH_API}/${pageId}/message_attachments`;

  const formData = new FormData();
  formData.append(
    "message",
    JSON.stringify({ attachment: { type: attachmentTypeFromMime(mimeType), payload: { is_reusable: true } } })
  );
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  formData.append("filedata", blob, filename);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${pageAccessToken}` },
    body: formData,
    signal: httpTimeout(HTTP_TRANSFER_TIMEOUT_MS),
  });

  if (!res.ok) await parseGraphError(res, "Upload attachment failed");

  const data = await res.json();
  return { attachmentId: data.attachment_id };
}

export interface MetaUserProfile {
  name: string | null;
}

// Messenger/Instagram no mandan el nombre del contacto en el webhook (a
// diferencia de Telegram) — se pide aparte, y solo la primera vez (ver
// lib/telegram/ingest-message.ts: contactName acepta este callback).
export async function fetchUserProfile(pageAccessToken: string, psid: string): Promise<MetaUserProfile> {
  const url = `${GRAPH_API}/${psid}?fields=name`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${pageAccessToken}` }, signal: httpTimeout(), });
  if (!res.ok) {
    // No fatal: sin nombre, ingest-message.ts cae al remoteJid como fallback
    // (mismo criterio que un Contact sin profile.name en WhatsApp).
    return { name: null };
  }
  const data = await res.json().catch(() => ({}));
  return { name: typeof data.name === "string" ? data.name : null };
}

// Equivalente a Telegram setWebhook()/deleteWebhook(): agregar la cuenta a
// nuestra base no hace que Meta empiece a mandar webhooks — hay que
// suscribir la Página al App explícitamente. `extraFields` (roadmap P3-c:
// `["feed"]` para Facebook Page, activa el webhook de comentarios además de
// mensajería) se agrega solo cuando el llamador lo pide — Instagram no
// reutiliza este campo (sus comentarios son un field distinto, fuera de
// alcance de esta primera versión).
export async function subscribePageToApp(pageAccessToken: string, pageId: string, extraFields: string[] = []): Promise<void> {
  const fields = ["messages", ...extraFields].join(",");
  const url = `${GRAPH_API}/${pageId}/subscribed_apps?subscribed_fields=${fields}`;
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${pageAccessToken}` }, signal: httpTimeout(), });
  if (!res.ok) await parseGraphError(res, "Page subscription failed");
}

export async function unsubscribePageFromApp(pageAccessToken: string, pageId: string): Promise<void> {
  const url = `${GRAPH_API}/${pageId}/subscribed_apps`;
  const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${pageAccessToken}` }, signal: httpTimeout(), });
  if (!res.ok) await parseGraphError(res, "Page unsubscription failed");
}
