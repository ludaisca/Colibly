import { WEBHOOK_DELIVERY_RETENTION_DAYS } from "@/lib/api/constants";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { resolveAbsolutePath } from "@/lib/whatsapp/media-store";
import { purgeExpiredMcpOAuth } from "@/lib/mcp/customer/oauth";

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

// El registro de entregas de webhooks solo sirve para depurar integraciones
// recientes; sin purga crece una fila por evento y endpoint para siempre.

export async function processMediaCleanupJob() {
  // Antes de la salida por MEDIA_RETENTION_DAYS: es independiente de la media.
  const { count: deliveries } = await prisma.webhookDelivery.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - WEBHOOK_DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
  });
  if (deliveries > 0) console.log(`[media-cleanup] ${deliveries} entrega(s) de webhook purgada(s)`);

  // Archivos de POST /api/v1/media: caducan solos (API_MEDIA_RETENTION_DAYS).
  const apiMedia = await purgeBatches(
    "API",
    async () => (await prisma.apiMedia.findMany({ where: { expiresAt: { lt: new Date() } }, select: { id: true, path: true }, take: BATCH_SIZE })).map((m) => ({ id: m.id, mediaUrl: m.path })),
    (ids) => prisma.apiMedia.deleteMany({ where: { id: { in: ids } } })
  );
  if (apiMedia > 0) console.log(`[media-cleanup] ${apiMedia} archivo(s) de la API caducado(s)`);

  // OAuth del MCP de clientes: códigos y tokens vencidos, conexiones sin uso.
  const oauth = await purgeExpiredMcpOAuth();
  if (oauth.codes + oauth.tokens + oauth.connections > 0) {
    console.log(`[media-cleanup] MCP OAuth: ${oauth.codes} código(s), ${oauth.tokens} token(s), ${oauth.connections} conexión(es) sin uso`);
  }

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
