import { prisma } from "@/lib/prisma";
import { saveMediaFromMeta, saveMediaFromBuffer } from "@/lib/whatsapp/media-store";
import { decrypt } from "@/lib/crypto";
import { getFileUrl } from "@/lib/telegram";
import { httpTimeout, HTTP_TRANSFER_TIMEOUT_MS } from "@/lib/http-timeouts";

interface MediaDownloadJob {
  messageId: string;
  accountId: string;
  mediaId: string;
  // Messenger/Instagram se conectan a este switch cuando exista su
  // implementación (ver plan de canales Meta) — a diferencia de Telegram,
  // ahí `mediaId` ya ES la URL directa del adjunto, sin paso getFile().
  channel?: "TELEGRAM" | "MESSENGER" | "INSTAGRAM";
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

  const message = await prisma.wAMessage.findUnique({
    where: { id: job.messageId },
    select: { id: true, mediaUrl: true, messageType: true, chat: { select: { accountId: true } } },
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
      mimeType: stored.remoteMimeType,
    },
  });
}

async function processTelegramMediaDownload(job: MediaDownloadJob) {
  const message = await prisma.channelMessage.findUnique({
    where: { id: job.messageId },
    select: { id: true, mediaUrl: true, mimeType: true },
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
    data: { mediaUrl: stored.relativePath, bytesSize: stored.bytesSize },
  });
}

// Messenger/Instagram no requieren un paso equivalente a getFileUrl(): el
// webhook ya entrega la URL directa y fetcheable del adjunto (CDN firmada
// de Meta) como `job.mediaId` — ver app/api/meta/webhook/messaging/route.ts.
async function processMetaChannelMediaDownload(job: MediaDownloadJob) {
  const message = await prisma.channelMessage.findUnique({
    where: { id: job.messageId },
    select: { id: true, mediaUrl: true, mimeType: true },
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

  const stored = await saveMediaFromBuffer(job.accountId, buffer, message.mimeType);

  await prisma.channelMessage.update({
    where: { id: job.messageId },
    data: { mediaUrl: stored.relativePath, bytesSize: stored.bytesSize },
  });
}