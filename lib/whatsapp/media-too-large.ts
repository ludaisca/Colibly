import { prisma } from "@/lib/prisma";
import { jidCandidates } from "@/lib/whatsapp/coexistence/normalize";
import { ingestInboundMessage } from "@/lib/whatsapp/ingest-message";

// Un cliente manda un archivo que Meta no puede entregar a la API (límite de
// 100 MB; WhatsApp deja mandar documentos de hasta 2 GB). Meta no envía el
// mensaje: solo un `statuses[].failed` con el error 131052 sobre un wamid que
// Colibly nunca guardó, así que el chat quedaba sin rastro y el cliente creía
// haber mandado su archivo. Se guarda un aviso en el hilo (messageType
// "media_too_large"); en una cuenta de Coexistencia el archivo sí está en la
// app del teléfono.

export const MEDIA_TOO_LARGE_TYPE = "media_too_large";
export const MEDIA_TOO_LARGE_CODE = 131052;
/** Tope de Meta para descargar un medio por la Cloud API. */
export const META_MEDIA_MAX_MB = 100;

export interface MediaTooLargeContent {
  kind: "media_too_large";
  maxMb: number;
  /** Tamaño del archivo según Meta, si lo dijo. */
  sizeMb: number | null;
  /** true: el archivo se puede ver en la app de WhatsApp Business del teléfono. */
  onPhone: boolean;
}

interface FailedStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number | string; message?: string; title?: string; error_data?: { details?: string } }>;
}

export function isMediaTooLargeStatus(status: FailedStatus): boolean {
  if (status.status !== "failed") return false;
  const code = Number(status.errors?.[0]?.code);
  return code === MEDIA_TOO_LARGE_CODE;
}

/** "Media file size too big 150.548046MB. Max file size we currently support: 100MB" → 150.5 */
export function parseSizeMb(status: FailedStatus): number | null {
  const err = status.errors?.[0];
  const text = [err?.message, err?.error_data?.details, err?.title].filter(Boolean).join(" ");
  const m = text.match(/too big\s+(\d+(?:\.\d+)?)\s*MB/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

export function mediaTooLargeNotice(c: Pick<MediaTooLargeContent, "maxMb" | "sizeMb" | "onPhone">): string {
  const size = c.sizeMb ? ` (${c.sizeMb} MB)` : "";
  const base = `El cliente envió un archivo${size} que excede el tamaño máximo de ${c.maxMb} MB y no se puede mostrar aquí.`;
  return c.onPhone
    ? `${base} Puedes verlo en el teléfono conectado (app de WhatsApp Business).`
    : `${base} Pídele que lo envíe más ligero o por otro medio.`;
}

/**
 * Guarda el aviso en el chat del cliente (lo crea si es su primer mensaje).
 * Idempotente por wamid (Meta reintenta). Devuelve true si el aviso quedó atendido
 * (nuevo o ya guardado) y false si el wamid es de otro mensaje o no se pudo guardar.
 * No despierta al bot ni a las automatizaciones: leerían el aviso como si el
 * cliente lo hubiera escrito.
 */
export async function recordMediaTooLarge(accountId: string, status: FailedStatus): Promise<boolean> {
  if (!status.id || !status.recipient_id) return false;
  const known = await prisma.wAMessage.findFirst({ where: { wamid: status.id }, select: { id: true, messageType: true } });
  // Un reintento de Meta sobre un aviso que ya guardamos: atendido, sin duplicar
  // ni marcar el aviso como fallido. Si el wamid es otro mensaje (un envío
  // nuestro rechazado), sigue el camino normal.
  if (known) return known.messageType === MEDIA_TOO_LARGE_TYPE;

  const account = await prisma.wAAccount.findUnique({ where: { id: accountId }, select: { coexistence: true } });
  if (!account) return false;

  // El chat puede estar guardado como 52… o 521…: se usa el que ya existe.
  const candidates = jidCandidates(status.recipient_id);
  const existing = candidates.length
    ? await prisma.wAChat.findFirst({ where: { accountId, remoteJid: { in: candidates } }, select: { remoteJid: true, name: true } })
    : null;
  const remoteJid = existing?.remoteJid ?? status.recipient_id;

  const content: MediaTooLargeContent = { kind: "media_too_large", maxMb: META_MEDIA_MAX_MB, sizeMb: parseSizeMb(status), onPhone: account.coexistence };
  const tsNum = Number(status.timestamp);
  const result = await ingestInboundMessage(accountId, {
    remoteJid,
    wamid: status.id,
    timestamp: Number.isFinite(tsNum) && tsNum > 0 ? new Date(tsNum * 1000) : new Date(),
    type: MEDIA_TOO_LARGE_TYPE,
    body: mediaTooLargeNotice(content),
    contactName: existing?.name ?? remoteJid,
    isGroup: false,
    content: content as unknown as Parameters<typeof ingestInboundMessage>[1]["content"],
    notice: true,
  });
  return result !== null;
}
