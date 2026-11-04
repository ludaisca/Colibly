// Contenido de un mensaje de WhatsApp tal como lo manda Meta (webhook `messages`,
// `smb_message_echoes` e `history` comparten la forma de cada tipo). Extraído de
// app/api/whatsapp/webhook/route.ts para reutilizarlo con ecos e historial.
export interface WhatsAppMessageContent {
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string; sha256?: string };
  video?: { id: string; mime_type: string; caption?: string; sha256?: string };
  audio?: { id: string; mime_type: string; sha256?: string; voice?: boolean };
  sticker?: { id: string; mime_type: string; animated?: boolean; sha256?: string };
  document?: { id: string; mime_type: string; caption?: string; filename?: string; sha256?: string };
  // Tipos que antes se guardaban solo como "[tipo]" (payloads reales en
  // docs/META_JSON_CUENTAS_WA_2026-11-04.md §7).
  location?: { latitude?: number; longitude?: number; name?: string; address?: string; url?: string };
  contacts?: MetaSharedContact[];
  order?: { catalog_id?: string; text?: string; product_items?: { product_retailer_id?: string; quantity?: number | string; item_price?: number | string; currency?: string }[] };
  system?: { body?: string; type?: string; wa_id?: string; customer?: string; identity?: string };
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
  context?: { id?: string; from?: string; forwarded?: boolean; frequently_forwarded?: boolean; referred_product?: { catalog_id?: string; product_retailer_id?: string } };
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

// Contacto compartido (`type: "contacts"`), tal como lo manda Meta.
export interface MetaSharedContact {
  name?: { formatted_name?: string; first_name?: string; last_name?: string };
  phones?: { phone?: string; wa_id?: string; type?: string }[];
  emails?: { email?: string; type?: string }[];
  org?: { company?: string; title?: string };
  urls?: { url?: string }[];
  vcard?: string;
}

export interface StoredInteractivePayload {
  buttons: { id: string; title: string }[];
  style?: "list";
  buttonLabel?: string;
}

// Texto legible del mensaje: es lo que ve la lista de chats, la notificación,
// el bot y las automatizaciones. Ubicación, contactos y pedidos tenían el
// marcador "[tipo]"; ahora una frase corta (el dato completo va en `content`).
export function getMessageBody(msg: WhatsAppMessageContent): string {
  if (msg.text) return msg.text.body;
  if (msg.type === "location" && msg.location) {
    const place = [msg.location.name, msg.location.address].filter(Boolean).join(" · ");
    return `📍 ${place || "Ubicación"}`;
  }
  if (msg.type === "contacts" && msg.contacts?.length) {
    const names = msg.contacts.map((c) => c.name?.formatted_name || c.phones?.[0]?.phone).filter(Boolean);
    return `👤 ${names.join(", ") || "Contacto"}`;
  }
  if (msg.type === "order" && msg.order) {
    const items = msg.order.product_items?.length ?? 0;
    return `🛒 Pedido${items ? ` (${items} ${items === 1 ? "producto" : "productos"})` : ""}${msg.order.text ? `: ${msg.order.text}` : ""}`;
  }
  if (msg.type === "system" && msg.system?.body) return msg.system.body;
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

// Contenido estructurado que se guarda en WAMessage.content (y viaja en la API
// y los webhooks como `content`). Solo lleva lo que NO cabe ya en las columnas
// (body, caption, mediaId, mimeType, filename, replyToWamid): null si no hay
// nada que añadir, para no llenar la tabla de mensajes con objetos vacíos.
export type StructuredContent = {
  location?: { latitude: number; longitude: number; name: string | null; address: string | null; url: string | null };
  contacts?: {
    name: string | null;
    phones: { phone: string | null; waId: string | null; type: string | null }[];
    emails: string[];
    company: string | null;
  }[];
  order?: { catalogId: string | null; text: string | null; items: { productId: string | null; quantity: number | null; price: number | null; currency: string | null }[] };
  system?: { type: string | null; body: string | null; newWaId: string | null };
  // Mensaje no soportado o con error de Meta (p. ej. tipo desconocido).
  errors?: { code: number | null; title: string | null; detail: string | null }[];
  media?: { sha256: string | null; voice?: boolean; animated?: boolean };
  forwarded?: boolean;
  frequentlyForwarded?: boolean;
  referredProduct?: { catalogId: string | null; productId: string | null };
  // Quién escribió el mensaje citado (`context.from`): el número del cliente
  // o el del negocio.
  replyToFrom?: string | null;
  // Solo en la forma pública (serializeMessage), no se guarda: el historial de
  // Coexistencia manda el medio en un webhook aparte; hasta entonces el mensaje
  // es `media_placeholder` y luego el MISMO mensaje cambia a su tipo real.
  placeholder?: { reason: "history_media" };
};

const toNumber = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function structuredContentOf(msg: WhatsAppMessageContent): StructuredContent | null {
  const out: StructuredContent = {};
  const loc = msg.location;
  const lat = toNumber(loc?.latitude);
  const lng = toNumber(loc?.longitude);
  if (msg.type === "location" && lat !== null && lng !== null) {
    out.location = { latitude: lat, longitude: lng, name: loc?.name ?? null, address: loc?.address ?? null, url: loc?.url ?? null };
  }
  if (msg.type === "contacts" && msg.contacts?.length) {
    // La vCard (base64, con foto) no se guarda: los campos sueltos ya llevan
    // lo útil y la foto inflaría cada fila.
    out.contacts = msg.contacts.map((c) => ({
      name: c.name?.formatted_name ?? ([c.name?.first_name, c.name?.last_name].filter(Boolean).join(" ") || null),
      phones: (c.phones ?? []).map((p) => ({ phone: p.phone ?? null, waId: p.wa_id ?? null, type: p.type ?? null })),
      emails: (c.emails ?? []).map((e) => e.email).filter((e): e is string => !!e),
      company: c.org?.company ?? null,
    }));
  }
  if (msg.type === "order" && msg.order) {
    out.order = {
      catalogId: msg.order.catalog_id ?? null,
      text: msg.order.text ?? null,
      items: (msg.order.product_items ?? []).map((i) => ({
        productId: i.product_retailer_id ?? null,
        quantity: toNumber(i.quantity),
        price: toNumber(i.item_price),
        currency: i.currency ?? null,
      })),
    };
  }
  if (msg.type === "system" && msg.system) {
    out.system = { type: msg.system.type ?? null, body: msg.system.body ?? null, newWaId: msg.system.wa_id ?? null };
  }
  if (msg.errors?.length) {
    out.errors = msg.errors.map((e) => ({ code: typeof e.code === "number" ? e.code : null, title: e.title ?? null, detail: e.error_data?.details ?? e.message ?? null }));
  }
  const media = msg.image ?? msg.video ?? msg.audio ?? msg.sticker ?? msg.document;
  if (media?.sha256 || msg.audio?.voice !== undefined || msg.sticker?.animated !== undefined) {
    out.media = {
      sha256: media?.sha256 ?? null,
      ...(msg.audio?.voice !== undefined ? { voice: !!msg.audio.voice } : {}),
      ...(msg.sticker?.animated !== undefined ? { animated: !!msg.sticker.animated } : {}),
    };
  }
  if (msg.context?.forwarded) out.forwarded = true;
  if (msg.context?.frequently_forwarded) out.frequentlyForwarded = true;
  if (msg.context?.referred_product) {
    out.referredProduct = { catalogId: msg.context.referred_product.catalog_id ?? null, productId: msg.context.referred_product.product_retailer_id ?? null };
  }
  if (msg.context?.id && msg.context.from) out.replyToFrom = msg.context.from;
  return Object.keys(out).length > 0 ? out : null;
}
