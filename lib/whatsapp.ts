import { httpTimeout, HTTP_TRANSFER_TIMEOUT_MS } from "@/lib/http-timeouts";
import { MetaSendError } from "@/lib/whatsapp/send-errors";
import { GRAPH_API_VERSION } from "@/lib/meta/graph";

const API_VERSION = GRAPH_API_VERSION;
const BASE_URL = "https://graph.facebook.com";

interface SendMessageParams {
  to: string;
  type: "text" | "image" | "audio" | "video" | "document" | "sticker" | "reaction" | "location";
  reactionMessageId?: string;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  emoji?: string;
  body?: string;
  mediaId?: string;
  mimeType?: string;
  caption?: string;
  filename?: string;
  replyToWamid?: string;
}

interface SendMessageResponse {
  messagingProduct: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

interface PhoneNumberInfo {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string;
  codeVerificationStatus: string;
  qualityRating: string;
}

export async function validateToken(
  phoneNumberId: string,
  accessToken: string
): Promise<PhoneNumberInfo> {
  const url = `${BASE_URL}/${API_VERSION}/${phoneNumberId}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    signal: httpTimeout(),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body?.error?.message ?? `Token validation failed (HTTP ${res.status})`
    );
  }

  return res.json() as Promise<PhoneNumberInfo>;
}

// APPROVED habilita citar un mensaje. PENDING_REVIEW, DECLINED y el resto no:
// Meta responde 131037 si el nombre no está aprobado: siempre al citar
// (context.message_id) y a veces también en envíos normales (número LIMITED).
export async function getDisplayNameStatus(phoneNumberId: string, accessToken: string): Promise<string | null> {
  const url = `${BASE_URL}/${API_VERSION}/${phoneNumberId}?fields=name_status`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: httpTimeout(),
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { name_status?: string } | null;
  return body?.name_status ?? null;
}

export async function sendMessage(
  phoneNumberId: string,
  accessToken: string,
  params: SendMessageParams
): Promise<SendMessageResponse> {
  const url = `${BASE_URL}/${API_VERSION}/${phoneNumberId}/messages`;

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.to,
    type: params.type,
  };
  if (params.replyToWamid) payload.context = { message_id: params.replyToWamid };

  if (params.type === "text") {
    payload.text = { body: params.body ?? "", preview_url: false };
  } else if (params.type === "reaction") {
    payload.reaction = { message_id: params.reactionMessageId, emoji: params.emoji ?? "" };
  } else if (params.type === "sticker") {
    payload.sticker = { id: params.mediaId };
  } else if (params.type === "location") {
    const loc = params.location;
    if (!loc) throw new Error("Falta la ubicación");
    payload.location = { latitude: loc.latitude, longitude: loc.longitude, ...(loc.name ? { name: loc.name } : {}), ...(loc.address ? { address: loc.address } : {}) };
  } else {
    // Graph no acepta mime_type aquí: el tipo queda fijado al subir el archivo.
    // filename solo existe en document; en imagen, audio o video es una clave de más.
    const media: Record<string, string> = {};
    if (params.mediaId) media.id = params.mediaId;
    if (params.caption && params.type !== "audio") media.caption = params.caption;
    if (params.filename && params.type === "document") media.filename = params.filename;
    payload[params.type] = media;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: httpTimeout(),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const meta = body?.error as { message?: string; code?: number } | undefined;
    throw new MetaSendError(
      meta?.message ?? `Send message failed (HTTP ${res.status})`,
      typeof meta?.code === "number" ? meta.code : null,
    );
  }

  return res.json() as Promise<SendMessageResponse>;
}

// Marca un mensaje entrante como leído (palomitas azules para el cliente) y,
// con `typing`, muestra "escribiendo…" hasta 25 s o hasta la respuesta.
// Meta marca también como leídos los anteriores de ese chat.
export async function markMessageRead(
  phoneNumberId: string,
  accessToken: string,
  wamid: string,
  opts: { typing?: boolean } = {}
): Promise<void> {
  const res = await fetch(`${BASE_URL}/${API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: wamid,
      ...(opts.typing ? { typing_indicator: { type: "text" } } : {}),
    }),
    signal: httpTimeout(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const meta = body?.error as { message?: string; code?: number } | undefined;
    throw new MetaSendError(meta?.message ?? `Mark as read failed (HTTP ${res.status})`, typeof meta?.code === "number" ? meta.code : null);
  }
}

export async function getMediaUrl(
  mediaId: string,
  accessToken: string
): Promise<{ url: string; mimeType: string }> {
  const res = await fetch(`${BASE_URL}/${API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: httpTimeout(),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body?.error?.message ?? `Get media failed (HTTP ${res.status})`
    );
  }

  return res.json() as Promise<{ url: string; mimeType: string }>;
}

export interface UploadedMedia {
  id: string;
}

export async function uploadMedia(
  phoneNumberId: string,
  accessToken: string,
  file: File | Buffer,
  filename: string,
  mimeType: string
): Promise<UploadedMedia> {
  const url = `${BASE_URL}/${API_VERSION}/${phoneNumberId}/media`;

  const formData = new FormData();
  if (file instanceof File) {
    formData.append("file", file, filename);
  } else {
    const blob = new Blob([new Uint8Array(file)], { type: mimeType });
    formData.append("file", blob, filename);
  }
  formData.append("messaging_product", "whatsapp");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
    signal: httpTimeout(HTTP_TRANSFER_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body?.error?.message ?? `Upload media failed (HTTP ${res.status})`
    );
  }

  return res.json() as Promise<UploadedMedia>;
}
