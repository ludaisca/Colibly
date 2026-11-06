import path from "node:path";
import { safeFetch, SafeFetchError } from "@/lib/net/safe-fetch";

// Archivos que se envían por API (POST /api/v1/messages con type image,
// document, audio o video): el integrador da una URL pública https, Colibly la
// descarga (lib/net/safe-fetch.ts: nunca direcciones internas, sin
// redirecciones), valida tipo y tamaño y la manda por el canal.
//
// Tipos y tamaños: los de WhatsApp Cloud API, el canal más estricto, para que
// el mismo envío funcione en cualquier canal. Documentos hasta 20 MB (el mismo
// tope que la bandeja).

export const OUTBOUND_MEDIA_TYPES = ["image", "document", "audio", "video"] as const;
export type OutboundMediaType = (typeof OUTBOUND_MEDIA_TYPES)[number];

const MB = 1024 * 1024;

export const OUTBOUND_MEDIA_RULES: Record<OutboundMediaType, { maxBytes: number; mimeTypes: string[] }> = {
  image: { maxBytes: 5 * MB, mimeTypes: ["image/jpeg", "image/png"] },
  audio: { maxBytes: 16 * MB, mimeTypes: ["audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg"] },
  video: { maxBytes: 16 * MB, mimeTypes: ["video/mp4", "video/3gpp"] },
  document: {
    maxBytes: 20 * MB,
    mimeTypes: [
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  },
};

/**
 * Límite de tamaño de un archivo según su MIME (los de WhatsApp Cloud API, que
 * son más estrictos que cualquier otro canal). Lo usan la bandeja y la API para
 * rechazar antes de subir en vez de esperar el error de Meta. null = sin regla
 * propia (el tope general lo pone quien llama).
 */
export function mediaLimitFor(mimeType: string | null | undefined): { type: OutboundMediaType; maxBytes: number; label: string } | null {
  const mime = (mimeType ?? "").toLowerCase();
  const type: OutboundMediaType | null = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : mime ? "document" : null;
  if (!type) return null;
  const labels: Record<OutboundMediaType, string> = { image: "Las imágenes", video: "Los videos", audio: "Los audios", document: "Los documentos" };
  return { type, maxBytes: OUTBOUND_MEDIA_RULES[type].maxBytes, label: labels[type] };
}

// Muchos servidores mandan application/octet-stream: el tipo se deduce de la extensión.
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  aac: "audio/aac",
  amr: "audio/amr",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const DOWNLOAD_TIMEOUT_MS = 30_000;
const GENERIC_MIME = new Set(["", "application/octet-stream", "binary/octet-stream", "application/force-download"]);

export class OutboundMediaError extends Error {}

export interface OutboundMediaFile {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

function baseMime(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().split(";")[0].trim();
}

function extensionOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

function filenameFromUrl(url: URL): string | null {
  const last = url.pathname.split("/").filter(Boolean).pop();
  if (!last) return null;
  try {
    return decodeURIComponent(last).slice(0, 200);
  } catch {
    return last.slice(0, 200);
  }
}

/** Decide el tipo final y lo valida contra las reglas. Pura (sin red), para probarla. */
export function resolveOutboundMime(
  type: OutboundMediaType,
  input: { declared?: string | null; header?: string | null; filename: string }
): string {
  const rules = OUTBOUND_MEDIA_RULES[type];
  const fromName = MIME_BY_EXT[extensionOf(input.filename)] ?? null;
  const declared = baseMime(input.declared);
  const header = baseMime(input.header);
  const mime = declared || (GENERIC_MIME.has(header) ? (fromName ?? header) : header);
  if (!rules.mimeTypes.includes(mime)) {
    throw new OutboundMediaError(
      `Tipo de archivo no admitido para ${type}: ${mime || "desconocido"}. Admitidos: ${rules.mimeTypes.join(", ")}` +
        (declared ? "" : ". Si el servidor no informa bien el tipo, envía media.mimeType")
    );
  }
  return mime;
}

export function defaultFilename(type: OutboundMediaType, mimeType: string): string {
  const ext = Object.entries(MIME_BY_EXT).find(([, m]) => m === mimeType)?.[0] ?? "bin";
  return `${type === "document" ? "documento" : type}.${ext}`;
}

export async function fetchOutboundMedia(
  type: OutboundMediaType,
  input: { url: string; filename?: string | null; mimeType?: string | null }
): Promise<OutboundMediaFile> {
  const rules = OUTBOUND_MEDIA_RULES[type];
  let res;
  try {
    res = await safeFetch(input.url, {
      method: "GET",
      binary: true,
      maxResponseBytes: rules.maxBytes + 1,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      headers: { Accept: "*/*", "User-Agent": "Colibly-Media/1.0 (+https://colibly.com)" },
    });
  } catch (err) {
    if (err instanceof SafeFetchError) {
      const why =
        err.code === "TIMEOUT"
          ? `no respondió en ${DOWNLOAD_TIMEOUT_MS / 1000} s`
          : err.code === "BLOCKED_ADDRESS"
            ? "apunta a una dirección interna o reservada"
            : err.code === "INVALID_URL"
              ? err.message.replace(/^La URL /, "")
              : `no se pudo descargar (${err.message})`;
      throw new OutboundMediaError(`media.url ${why}`);
    }
    throw err;
  }
  if (res.status >= 300 && res.status < 400) throw new OutboundMediaError(`media.url respondió ${res.status} (redirección): usa la URL final del archivo`);
  if (res.status < 200 || res.status >= 300) throw new OutboundMediaError(`media.url respondió ${res.status}`);
  if (res.truncated || res.buffer.length > rules.maxBytes) {
    throw new OutboundMediaError(`El archivo supera el máximo de ${rules.maxBytes / MB} MB para ${type}`);
  }
  if (res.buffer.length === 0) throw new OutboundMediaError("media.url devolvió un archivo vacío");

  const nameFromUrl = filenameFromUrl(new URL(input.url));
  const provisional = input.filename?.trim() || nameFromUrl || "";
  const mimeType = resolveOutboundMime(type, { declared: input.mimeType, header: res.headers["content-type"], filename: provisional });
  const filename = provisional && extensionOf(provisional) ? provisional : defaultFilename(type, mimeType);
  return { buffer: res.buffer, mimeType, filename };
}
