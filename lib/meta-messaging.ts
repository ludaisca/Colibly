import { httpTimeout, HTTP_TRANSFER_TIMEOUT_MS } from "@/lib/http-timeouts";
import { GRAPH_API_ORIGIN, GRAPH_API_VERSION } from "@/lib/meta/graph";

// Cliente núcleo para Messenger e Instagram — ambos comparten el mismo
// Page Access Token y el mismo graph.facebook.com bajo el modelo
// Página-vinculada (confirmado con el usuario, no el Instagram Login
// standalone), así que un solo cliente basta para los dos canales, igual
// que lib/telegram.ts es el único cliente para Telegram.
// En producción, graph.facebook.com; en dev puede apuntar a un Meta simulado
// (META_GRAPH_ORIGIN) para probar envíos sin tocar páginas reales.
const GRAPH_API = `${GRAPH_API_ORIGIN}/${GRAPH_API_VERSION}`;

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

// Respuesta privada a un comentario de la Página: la única forma de escribirle
// por Messenger a alguien que solo comentó. Va por el Send API normal con
// recipient.comment_id (el edge viejo /{comment-id}/private_replies ya no está
// en la documentación de Meta). Una sola por comentario, dentro de 7 días; la
// respuesta trae el PSID de la persona en recipient_id, que puede ser distinto
// del id del comentarista. Reglas: lib/meta-messaging/comment-rules.ts.
export async function sendPrivateReplyToComment(
  pageAccessToken: string,
  pageId: string,
  commentId: string,
  text: string
): Promise<SendMessageResult> {
  const res = await fetch(`${GRAPH_API}/${pageId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pageAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
    signal: httpTimeout(),
  });
  if (!res.ok) await parseGraphError(res, "Private reply failed");
  const data = await res.json();
  return { recipientId: data.recipient_id ?? "", messageId: data.message_id ?? "" };
}

// Respuesta pública: un comentario de la Página bajo el comentario de la
// persona. Necesita pages_manage_engagement en el token de la Página. Meta la
// devuelve por el webhook `feed` como comentario de la propia Página, que la
// ingesta descarta.
export async function replyToCommentPublicly(pageAccessToken: string, commentId: string, text: string): Promise<{ commentId: string }> {
  const res = await fetch(`${GRAPH_API}/${commentId}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pageAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
    signal: httpTimeout(),
  });
  if (!res.ok) await parseGraphError(res, "Public comment reply failed");
  const data = await res.json();
  return { commentId: data.id ?? "" };
}

// Instagram: la respuesta pública a un comentario es una respuesta en su hilo
// (/{ig-comment-id}/replies, permiso instagram_manage_comments).
export async function replyToInstagramComment(pageAccessToken: string, commentId: string, text: string): Promise<{ commentId: string }> {
  const res = await fetch(`${GRAPH_API}/${commentId}/replies`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pageAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
    signal: httpTimeout(),
  });
  if (!res.ok) await parseGraphError(res, "Instagram comment reply failed");
  const data = await res.json();
  return { commentId: data.id ?? "" };
}

// Enlace público de la publicación o reel de Instagram donde se comentó (el
// webhook solo trae el id). null si Meta no lo da.
export async function fetchInstagramPermalink(pageAccessToken: string, mediaId: string): Promise<string | null> {
  const res = await fetch(`${GRAPH_API}/${mediaId}?fields=permalink`, {
    headers: { Authorization: `Bearer ${pageAccessToken}` },
    signal: httpTimeout(),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { permalink?: string };
  return typeof data.permalink === "string" && data.permalink.startsWith("https://www.instagram.com/") ? data.permalink : null;
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
