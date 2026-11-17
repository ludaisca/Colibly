import { prisma } from "@/lib/prisma";
import { emitMessageUpdated } from "@/lib/events/message-sent";
import { saveMediaFromMeta, saveMediaFromBuffer } from "@/lib/whatsapp/media-store";
import { decrypt } from "@/lib/crypto";
import { getFileUrl } from "@/lib/telegram";
import { readGowaCredentials } from "@/lib/gowa/account";
import { downloadMessageMedia } from "@/lib/gowa/client";
import { httpTimeout, HTTP_TRANSFER_TIMEOUT_MS } from "@/lib/http-timeouts";
import { queueAutoTranscribe } from "@/lib/ai/transcribe";

interface MediaDownloadJob {
  messageId: string;
  accountId: string;
  mediaId: string;
  // Messenger/Instagram se conectan a este switch cuando exista su
  // implementación (ver plan de canales Meta) — a diferencia de Telegram,
  // ahí `mediaId` ya ES la URL directa del adjunto, sin paso getFile().
  channel?: "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WHATSAPP_WEB";
}

export async function processMediaDownloadJob(job: MediaDownloadJob) {
  if (job.channel === "TELEGRAM") {
    await processTelegramMediaDownload(job);
    return;
  }
  if (job.channel === "MESSENGER" || job.channel === "INSTAGRAM") {
    await processMetaChannelMediaDownload(job);
    return;
  }
  if (job.channel === "WHATSAPP_WEB") {
    await processGowaMediaDownload(job);
    return;
  }

  const message = await prisma.wAMessage.findUnique({
    where: { id: job.messageId },
    select: { id: true, mediaUrl: true, messageType: true, direction: true, chat: { select: { accountId: true } } },
  });

  if (!message) return;
  if (message.mediaUrl) return; // ya descargado

  const account = await prisma.wAAccount.findUnique({
    where: { id: job.accountId },
    select: { id: true, channel: true, accessToken: true, status: true },
  });
  if (!account) return;
  if (account.channel !== "META_CLOUD" || !account.accessToken) {
    throw new Error("La cuenta no es Meta Cloud o no tiene token");
  }

  const stored = await saveMediaFromMeta(job.accountId, job.mediaId, account.accessToken);

  await prisma.wAMessage.update({
    where: { id: job.messageId },
    data: {
      mediaUrl: stored.relativePath,
      bytesSize: stored.bytesSize,
      mediaSha256: stored.sha256 ?? null,
      mimeType: stored.remoteMimeType,
    },
  });
  await emitMessageUpdated("whatsapp", job.messageId, "media_ready");
  if (message.messageType === "audio" && message.direction === "INBOUND") await queueAutoTranscribe("whatsapp", message.id);
}

async function processTelegramMediaDownload(job: MediaDownloadJob) {
  const message = await prisma.channelMessage.findUnique({
    where: { id: job.messageId },
    select: { id: true, mediaUrl: true, mimeType: true, messageType: true, direction: true },
  });
  if (!message) return;
  if (message.mediaUrl) return; // ya descargado

  const account = await prisma.channelAccount.findUnique({
    where: { id: job.accountId },
    select: { id: true, channel: true, credentials: true },
  });
  if (!account || account.channel !== "TELEGRAM") return;

  const { botToken } = JSON.parse(decrypt(account.credentials)) as { botToken: string };
  const fileUrl = await getFileUrl(botToken, job.mediaId);

  const res = await fetch(fileUrl, { signal: httpTimeout(HTTP_TRANSFER_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Descarga de medio Telegram fallida (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const stored = await saveMediaFromBuffer(job.accountId, buffer, message.mimeType);

  await prisma.channelMessage.update({
    where: { id: job.messageId },
    data: { mediaUrl: stored.relativePath, bytesSize: stored.bytesSize, mediaSha256: stored.sha256 ?? null },
  });
  await emitMessageUpdated("channel", job.messageId, "media_ready");
  if (message.messageType === "audio" && message.direction === "INBOUND") await queueAutoTranscribe("channel", message.id);
}

// Messenger/Instagram no requieren un paso equivalente a getFileUrl(): el
// webhook ya entrega la URL directa y fetcheable del adjunto (CDN firmada
// de Meta) como `job.mediaId` — ver app/api/meta/webhook/messaging/route.ts.
async function processMetaChannelMediaDownload(job: MediaDownloadJob) {
  const message = await prisma.channelMessage.findUnique({
    where: { id: job.messageId },
    select: { id: true, mediaUrl: true, mimeType: true, messageType: true, direction: true },
  });
  if (!message) return;
  if (message.mediaUrl) return; // ya descargado

  const account = await prisma.channelAccount.findUnique({
    where: { id: job.accountId },
    select: { id: true, channel: true },
  });
  if (!account || (account.channel !== "MESSENGER" && account.channel !== "INSTAGRAM")) return;

  const res = await fetch(job.mediaId, { signal: httpTimeout(HTTP_TRANSFER_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Descarga de medio ${account.channel} fallida (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());

  // El webhook de Meta no trae MIME: se adivina por el tipo de adjunto. La CDN
  // sí responde con el real (PDF, audio/mp4…), que es el que necesita el visor
  // del navegador. Si la CDN no lo dice, se detecta el PDF por su firma.
  const responseType = res.headers.get("content-type")?.split(";")[0].trim() || null;
  let mimeType = responseType && responseType !== "application/octet-stream" ? responseType : message.mimeType;
  if ((!mimeType || mimeType === "application/octet-stream") && buffer.subarray(0, 5).toString() === "%PDF-") {
    mimeType = "application/pdf";
  }

  const stored = await saveMediaFromBuffer(job.accountId, buffer, mimeType);

  await prisma.channelMessage.update({
    where: { id: job.messageId },
    data: { mediaUrl: stored.relativePath, bytesSize: stored.bytesSize, mediaSha256: stored.sha256 ?? null, mimeType },
  });
  await emitMessageUpdated("channel", job.messageId, "media_ready");
  if (message.messageType === "audio" && message.direction === "INBOUND") await queueAutoTranscribe("channel", message.id);
}
// WhatsApp por QR: `mediaId` es el id del mensaje; GoWA lo baja de WhatsApp
// bajo demanda (GET /message/:id/download) y lo sirve por la red interna.
async function processGowaMediaDownload(job: MediaDownloadJob) {
  const message = await prisma.channelMessage.findUnique({
    where: { id: job.messageId },
    select: { id: true, mediaUrl: true, mimeType: true, filename: true, messageType: true, direction: true, conversation: { select: { externalId: true } } },
  });
  if (!message || message.mediaUrl) return;

  const account = await prisma.channelAccount.findUnique({
    where: { id: job.accountId },
    select: { id: true, channel: true, credentials: true },
  });
  if (!account || account.channel !== "WHATSAPP_WEB") return;

  const { deviceId } = readGowaCredentials(account);
  const file = await downloadMessageMedia(deviceId, job.mediaId, message.conversation.externalId);
  const mimeType = file.mimeType && file.mimeType !== "application/octet-stream" ? file.mimeType : message.mimeType;
  const stored = await saveMediaFromBuffer(job.accountId, file.buffer, mimeType);

  await prisma.channelMessage.update({
    where: { id: job.messageId },
    data: {
      mediaUrl: stored.relativePath,
      bytesSize: stored.bytesSize,
      mediaSha256: stored.sha256 ?? null,
      mimeType,
      filename: message.filename ?? (message.messageType === "document" ? file.filename : null),
    },
  });
  await emitMessageUpdated("channel", job.messageId, "media_ready");
  if (message.messageType === "audio" && message.direction === "INBOUND") await queueAutoTranscribe("channel", message.id);
}
