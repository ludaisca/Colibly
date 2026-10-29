import { prisma } from "@/lib/prisma";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { saveMediaFromBuffer, resolveAbsolutePath, mediaReadStream, isInlineSafeMime, isPdfMime, contentDisposition } from "@/lib/whatsapp/media-store";

// Lógica genérica de media para cualquier canal sobre ChannelAccount/
// ChannelMessage — extraída de lo que ya era app/api/telegram/media y
// app/api/telegram/messages/[messageId]/media (ninguna de las dos tenía
// nada Telegram-específico), para que Messenger/Instagram la reusen sin
// duplicar el flujo completo dos veces más. Los wrappers por canal (p. ej.
// app/api/messenger/media/route.ts) solo parsean el request y traducen el
// resultado a NextResponse.

export type UploadChannelMediaResult =
  | { ok: true; data: { mediaId: null; mimeType: string | null; filename: string | null; bytesSize: number; localMediaPath: string } }
  | { ok: false; status: number; error: string };

// Igual que app/api/whatsapp/media/route.ts pero sin el paso "subir →
// obtener id" de la Graph API de Meta para mensajes salientes de canales
// genéricos: aquí solo se persiste una copia local (mediaId siempre null).
// Messenger/Instagram SÍ tienen su propio two-step (message_attachments),
// pero ocurre en el envío (lib/meta-messaging/send.ts), no en esta subida.
export async function uploadChannelMedia(userId: string, accountId: string, file: File): Promise<UploadChannelMediaResult> {
  const channelAccountIds = await getUserChannelAccountIds(userId);
  if (!channelAccountIds.includes(accountId)) {
    return { ok: false, status: 403, error: "No tienes acceso a esta cuenta" };
  }

  const account = await prisma.channelAccount.findFirst({ where: { id: accountId }, select: { id: true } });
  if (!account) {
    return { ok: false, status: 400, error: "Cuenta no encontrada" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await saveMediaFromBuffer(account.id, buffer, file.type || null);

  return {
    ok: true,
    data: { mediaId: null, mimeType: file.type || null, filename: file.name || null, bytesSize: buffer.length, localMediaPath: stored.relativePath },
  };
}

export type ServeChannelMediaResult =
  | { ok: true; stream: NodeJS.ReadableStream; headers: Headers }
  | { ok: false; status: number; error: string };

export async function resolveChannelMedia(userId: string, messageId: string): Promise<ServeChannelMediaResult> {
  const message = await prisma.channelMessage.findFirst({
    where: { id: messageId, conversation: { channelAccountId: { in: await getUserChannelAccountIds(userId) } } },
    select: { id: true, mediaUrl: true, mimeType: true, filename: true, messageType: true },
  });

  if (!message) return { ok: false, status: 404, error: "Mensaje no encontrado" };
  if (!message.mediaUrl) return { ok: false, status: 404, error: "Medio no disponible" };

  let stat;
  try {
    const { promises: fs } = await import("fs");
    stat = await fs.stat(resolveAbsolutePath(message.mediaUrl));
  } catch {
    return { ok: false, status: 404, error: "Archivo no encontrado" };
  }

  const stream = mediaReadStream(message.mediaUrl);
  const headers = new Headers();
  headers.set("Content-Type", message.mimeType ?? "application/octet-stream");
  headers.set("Content-Length", String(stat.size));
  // Los documentos cambiaron de "descarga" a "ver inline": no-store evita que
  // un navegador con la respuesta vieja cacheada siga descargándolos.
  headers.set("Cache-Control", message.messageType === "document" ? "private, no-cache" : "private, max-age=3600");

  // PDF: se sirve inline para que el visor del navegador lo abra (la CSP
  // `sandbox` de estas rutas impide que ejecute nada). El resto de documentos
  // se descarga. Los PDF viejos descargados de Meta pueden tener MIME
  // octet-stream: se detectan por el nombre y se corrigen al servir.
  const pdfByName = message.messageType === "document" && /\.pdf$/i.test(message.filename ?? "");
  const isPdf = isPdfMime(message.mimeType) || pdfByName;
  if (isPdf && !isPdfMime(message.mimeType)) headers.set("Content-Type", "application/pdf");
  const isInline =
    isPdf ||
    ((message.messageType === "image" || message.messageType === "audio" || message.messageType === "video") &&
      isInlineSafeMime(message.mimeType));
  if (isPdf) {
    headers.set("Content-Disposition", contentDisposition(message.filename, true));
  } else if (!isInline) {
    headers.set("Content-Disposition", contentDisposition(message.filename, false));
  }

  return { ok: true, stream, headers };
}
