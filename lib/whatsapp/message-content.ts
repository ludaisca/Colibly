// Contenido de un mensaje de WhatsApp tal como lo manda Meta (webhook `messages`,
// `smb_message_echoes` e `history` comparten la forma de cada tipo). Extraído de
// app/api/whatsapp/webhook/route.ts para reutilizarlo con ecos e historial.
export interface WhatsAppMessageContent {
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  video?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string };
  sticker?: { id: string; mime_type: string; animated?: boolean };
  document?: { id: string; mime_type: string; caption?: string; filename?: string };
  interactive?: {
    type?: string;
    body?: { text?: string };
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
    action?: {
      button?: string;
      buttons?: { reply?: { id?: string; title?: string } }[];
      sections?: { rows?: { id?: string; title?: string }[] }[];
    };
  };
  button?: { payload: string; text: string };
  // Edición de un mensaje (solo coexistencia): `message` es el contenido nuevo.
  edit?: { original_message_id?: string; message?: Omit<WhatsAppMessageContent, "type"> & { type?: string } };
}

export interface StoredInteractivePayload {
  buttons: { id: string; title: string }[];
  style?: "list";
  buttonLabel?: string;
}

export function getMessageBody(msg: WhatsAppMessageContent): string {
  if (msg.text) return msg.text.body;
  if (msg.image?.caption) return msg.image.caption;
  if (msg.video?.caption) return msg.video.caption;
  if (msg.document?.caption) return msg.document.caption;
  if (msg.interactive?.button_reply?.title) return msg.interactive.button_reply.title;
  if (msg.interactive?.list_reply?.title) return msg.interactive.list_reply.title;
  if (msg.button) return msg.button.text;
  if (msg.interactive?.body?.text) return msg.interactive.body.text;
  return `[${msg.type}]`;
}

// Botones o filas de un mensaje interactivo que el negocio envió (historial y
// ecos de la app de WhatsApp). La respuesta del cliente ya viene como título
// en getMessageBody y no se convierte en botones.
export function interactivePayloadOf(msg: WhatsAppMessageContent): StoredInteractivePayload | null {
  const action = msg.interactive?.action;
  if (!action) return null;
  const replyButtons = (action.buttons ?? [])
    .map((b, i) => ({ id: b.reply?.id || `btn_${i + 1}`, title: b.reply?.title?.trim() ?? "" }))
    .filter((b) => b.title);
  if (replyButtons.length > 0) return { buttons: replyButtons.slice(0, 3) };
  const rows = (action.sections ?? [])
    .flatMap((section) => section.rows ?? [])
    .map((row, i) => ({ id: row.id || `row_${i + 1}`, title: row.title?.trim() ?? "" }))
    .filter((row) => row.title);
  if (rows.length === 0) return null;
  return {
    buttons: rows.slice(0, 10),
    style: "list",
    ...(action.button?.trim() ? { buttonLabel: action.button.trim().slice(0, 20) } : {}),
  };
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
  if (msg.sticker) return {
    mediaId: msg.sticker.id,
    mimeType: msg.sticker.mime_type ?? null,
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

export interface ParsedMessageEdit {
  originalMessageId: string;
  // Texto nuevo (o pie de la imagen/video/documento editado); null si Meta no
  // trajo contenido legible, para no pisar el original con un marcador.
  body: string | null;
  caption: string | null;
}

// Meta manda la edición como un mensaje `type: "edit"` aparte; el cuerpo nuevo
// va en `edit.message` (para texto `text.body`, para medios `<tipo>.caption`).
export function parseMessageEdit(msg: WhatsAppMessageContent): ParsedMessageEdit | null {
  if (msg.type !== "edit") return null;
  const originalMessageId = msg.edit?.original_message_id;
  const next = msg.edit?.message;
  if (!originalMessageId || !next) return null;
  const content = { ...next, type: next.type ?? "text" } as WhatsAppMessageContent;
  const { caption } = getMediaInfo(content);
  const text = getMessageBody(content);
  const readable = text !== `[${content.type}]`;
  return { originalMessageId, body: readable ? text : null, caption };
}
