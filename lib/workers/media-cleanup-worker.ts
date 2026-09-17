import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { resolveAbsolutePath } from "@/lib/whatsapp/media-store";

const RETENTION_DAYS = Number(process.env.MEDIA_RETENTION_DAYS ?? 90);
const BATCH_SIZE = 200;

type MediaRow = { id: string; mediaUrl: string | null };

// Borra del disco los archivos de un lote y limpia su columna mediaUrl.
async function purgeBatches(
  label: string,
  findBatch: () => Promise<MediaRow[]>,
  clearMediaUrl: (ids: string[]) => Promise<unknown>
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const batch = await findBatch();
    if (batch.length === 0) break;

    for (const msg of batch) {
      try {
        await fs.unlink(resolveAbsolutePath(msg.mediaUrl!));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`[media-cleanup] No se pudo borrar ${msg.mediaUrl} (${label}):`, err);
        }
      }
    }

    await clearMediaUrl(batch.map((m) => m.id));
    deleted += batch.length;
    if (batch.length < BATCH_SIZE) break;
  }
  return deleted;
}

export async function processMediaCleanupJob() {
  if (!RETENTION_DAYS || RETENTION_DAYS <= 0) return;

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const where = { mediaUrl: { not: null }, timestamp: { lt: cutoff } };

  const whatsapp = await purgeBatches(
    "WhatsApp",
    () => prisma.wAMessage.findMany({ where, select: { id: true, mediaUrl: true }, take: BATCH_SIZE }),
    (ids) => prisma.wAMessage.updateMany({ where: { id: { in: ids } }, data: { mediaUrl: null } })
  );
  // Telegram, Messenger, Instagram (ChannelMessage) — antes solo se purgaba
  // WhatsApp y la media de estos canales crecía sin límite en media_data.
  const channels = await purgeBatches(
    "canales",
    () => prisma.channelMessage.findMany({ where, select: { id: true, mediaUrl: true }, take: BATCH_SIZE }),
    (ids) => prisma.channelMessage.updateMany({ where: { id: { in: ids } }, data: { mediaUrl: null } })
  );

  if (whatsapp + channels > 0) {
    console.log(
      `[media-cleanup] ${whatsapp + channels} archivo(s) de media purgado(s) — WhatsApp: ${whatsapp}, otros canales: ${channels} (retención: ${RETENTION_DAYS}d)`
    );
  }
}
