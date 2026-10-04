// Contenido de un mensaje de WhatsApp tal como lo manda Meta (webhook `messages`,
// `smb_message_echoes` e `history` comparten la forma de cada tipo). Extraído de
// app/api/whatsapp/webhook/route.ts para reutilizarlo con ecos e historial.
export interface WhatsAppMessageContent {
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  video?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; caption?: string; filename?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { payload: string; text: string };
}

export function getMessageBody(msg: WhatsAppMessageContent): string {
  if (msg.text) return msg.text.body;
  if (msg.image?.caption) return msg.image.caption;
  if (msg.video?.caption) return msg.video.caption;
  if (msg.document?.caption) return msg.document.caption;
  if (msg.interactive?.button_reply?.title) return msg.interactive.button_reply.title;
  if (msg.interactive?.list_reply?.title) return msg.interactive.list_reply.title;
  if (msg.button) return msg.button.text;
  return `[${msg.type}]`;
}

export function getMediaInfo(msg: WhatsAppMessageContent): {
  mediaId: string | null;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
} {
  if (msg.image) return {
    mediaId: msg.image.id,
    mimeType: msg.image.mime_type ?? null,
    filename: null,
    caption: msg.image.caption ?? null,
  };
  if (msg.video) return {
    mediaId: msg.video.id,
    mimeType: msg.video.mime_type ?? null,
    filename: null,
    caption: msg.video.caption ?? null,
  };
  if (msg.audio) return {
    mediaId: msg.audio.id,
    mimeType: msg.audio.mime_type ?? null,
    filename: null,
    caption: null,
  };
  if (msg.document) return {
    mediaId: msg.document.id,
    mimeType: msg.document.mime_type ?? null,
    filename: msg.document.filename ?? null,
    caption: msg.document.caption ?? null,
  };
  return { mediaId: null, mimeType: null, filename: null, caption: null };
}
