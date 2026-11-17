// Helpers de media puros (sin fs/crypto) — importables tanto desde el servidor
// (media-store.ts los re-exporta) como desde componentes cliente
// (chat-workspace.tsx). No agregar aquí nada que dependa de Node builtins.

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/ogg; codecs=opus": "ogg",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
};

export function mimeTypeToExtension(mimeType: string | null | undefined): string {
  if (!mimeType) return "bin";
  // Los MIME pueden traer parámetros ("audio/ogg; codecs=opus"): el tipo base
  // es lo que determina la extensión.
  const base = mimeType.toLowerCase().split(";")[0].trim();
  return EXT_BY_MIME[base] ?? "bin";
}

export function isImageMime(mimeType: string | null | undefined): boolean {
  return !!mimeType && mimeType.toLowerCase().startsWith("image/");
}

export function isAudioMime(mimeType: string | null | undefined): boolean {
  return !!mimeType && mimeType.toLowerCase().startsWith("audio/");
}

export function isVideoMime(mimeType: string | null | undefined): boolean {
  return !!mimeType && mimeType.toLowerCase().startsWith("video/");
}

export function isDocumentMime(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  const m = mimeType.toLowerCase();
  return (
    m.startsWith("application/") ||
    m.startsWith("text/") ||
    m === "application/pdf"
  );
}

export type MediaChannel = "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT" | "WHATSAPP_WEB";

// Cada canal sirve sus medios desde su propio endpoint (el id es un WAMessage
// en WhatsApp y un ChannelMessage en el resto). El widget web no tiene medios.
const MEDIA_ROUTE: Record<MediaChannel, string | null> = {
  WHATSAPP: "/api/whatsapp/messages",
  TELEGRAM: "/api/telegram/messages",
  MESSENGER: "/api/messenger/messages",
  INSTAGRAM: "/api/instagram/messages",
  WEBCHAT: null,
  // Ruta genérica de ChannelMessage (lib/channel-media.ts): sirve a cualquier canal.
  WHATSAPP_WEB: "/api/telegram/messages",
};

export function mediaEndpointFor(messageId: string, channel: MediaChannel = "WHATSAPP"): string | null {
  const base = MEDIA_ROUTE[channel];
  return base ? `${base}/${encodeURIComponent(messageId)}/media` : null;
}

// Tipos que el navegador puede mostrar inline desde el dominio de la app sin
// ejecutar nada. SVG, HTML y cualquier otro tipo se sirven como descarga: un
// image/svg+xml abierto directamente ejecutaría scripts con la sesión del
// usuario (la CSP de la app permite 'unsafe-inline').
const INLINE_SAFE_MIME = /^(image\/(jpeg|png|gif|webp|avif|heic|heif)|audio\/[\w.+-]+|video\/[\w.+-]+)$/;

export function isInlineSafeMime(mimeType: string | null | undefined): boolean {
  return !!mimeType && INLINE_SAFE_MIME.test(mimeType.toLowerCase().split(";")[0].trim());
}

export function isPdfMime(mimeType: string | null | undefined): boolean {
  return !!mimeType && mimeType.toLowerCase().split(";")[0].trim() === "application/pdf";
}

// Cabecera de descarga correcta: `filename=` solo admite ASCII y no debe ir
// URL-encoded (los navegadores no lo decodifican); el nombre real viaja en
// filename* (RFC 5987).
export function contentDisposition(filename: string | null | undefined, inline: boolean): string {
  const type = inline ? "inline" : "attachment";
  if (!filename) return type;
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  // encodeURIComponent deja ' ( ) * sin escapar y RFC 5987 no los admite.
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
