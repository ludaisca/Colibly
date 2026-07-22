import { prisma } from "@/lib/prisma";
import { saveMediaFromMeta, saveMediaFromBuffer } from "@/lib/whatsapp/media-store";
import { decrypt } from "@/lib/crypto";
import { getFileUrl } from "@/lib/telegram";

interface MediaDownloadJob {
  messageId: string;
  accountId: string;
  mediaId: string;
  channel?: "TELEGRAM";
}

export async function processMediaDownloadJob(job: MediaDownloadJob) {
  if (job.channel === "TELEGRAM") {
    await processTelegramMediaDownload(job);
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

  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Descarga de medio Telegram fallida (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const stored = await saveMediaFromBuffer(job.accountId, buffer, message.mimeType);

  await prisma.channelMessage.update({
    where: { id: job.messageId },
    data: { mediaUrl: stored.relativePath, bytesSize: stored.bytesSize },
  });
}