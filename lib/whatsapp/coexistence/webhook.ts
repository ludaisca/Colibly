import { prisma } from "@/lib/prisma";
import { coexistenceSyncQueue } from "@/lib/queue";
import { validateWhatsAppWebhookSignature } from "@/lib/meta/platform-app";
import { ingestBusinessAppMessages } from "./ingest";
import { normalizeEchoes, normalizeHistory, normalizeHistoryMedia, normalizeStateSync } from "./normalize";
import { serializeContacts, serializeMessages, type HistoryChunkJob, type HistoryMediaJob } from "./sync";

// Webhooks propios de la coexistencia: smb_message_echoes, history y
// smb_app_state_sync. El historial y los contactos pueden llegar en lotes de
// miles: se capturan aquí (rápido, para no hacer reintentar a Meta) y se
// procesan en la cola `coexistence-sync`.

export type CoexistenceField = "smb_message_echoes" | "history" | "smb_app_state_sync";

export const COEXISTENCE_FIELDS: readonly string[] = ["smb_message_echoes", "history", "smb_app_state_sync"];

const MESSAGES_PER_JOB = 1000;
const CONTACTS_PER_JOB = 500;

export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function handleCoexistenceChange(opts: {
  field: CoexistenceField;
  value: unknown;
  rawBody: string;
  signature: string | null;
}): Promise<void> {
  const phoneNumberId = (opts.value as { metadata?: { phone_number_id?: string } } | null)?.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const account = await prisma.wAAccount.findFirst({ where: { phoneNumberId } });
  if (!account) return;
  if (!(await validateWhatsAppWebhookSignature(opts.rawBody, opts.signature, account))) {
    console.warn(`[webhook] Firma inválida en ${opts.field} para la cuenta "${account.name}" (${account.id}) — payload descartado`);
    return;
  }
  if (!account.coexistence) {
    // Solo las cuentas conectadas por coexistencia deberían recibirlos.
    console.warn(`[webhook] ${opts.field} recibido para la cuenta "${account.name}" que no es de coexistencia — se ignora`);
    return;
  }
  await prisma.wAAccount.update({ where: { id: account.id }, data: { lastActivity: new Date() } });

  if (opts.field === "smb_message_echoes") {
    await ingestBusinessAppMessages(account.id, normalizeEchoes(opts.value), "BUSINESS_APP_ECHO");
    return;
  }

  if (opts.field === "smb_app_state_sync") {
    for (const contacts of chunkArray(normalizeStateSync(opts.value), CONTACTS_PER_JOB)) {
      await coexistenceSyncQueue.add("state-sync", { accountId: account.id, contacts: serializeContacts(contacts) });
    }
    return;
  }

  // Medios del historial: mismo field `history`, pero con `value.messages[]`
  // en lugar de `value.history[]` (normalizeHistoryMedia).
  const media = normalizeHistoryMedia(opts.value);
  if (media.length > 0) {
    await coexistenceSyncQueue.add("history-media", { accountId: account.id, items: media } satisfies HistoryMediaJob);
  }

  for (const env of normalizeHistory(opts.value)) {
    if (env.kind !== "chunk") {
      await coexistenceSyncQueue.add("history-chunk", { accountId: account.id, envelope: env } satisfies HistoryChunkJob);
      continue;
    }
    const pieces = chunkArray(env.messages, MESSAGES_PER_JOB);
    if (pieces.length === 0) pieces.push([]);
    for (let i = 0; i < pieces.length; i++) {
      const last = i === pieces.length - 1;
      // El progreso solo viaja en la última pieza: así "100 %" no se marca antes
      // de haber guardado todos los mensajes del lote.
      const job: HistoryChunkJob = {
        accountId: account.id,
        envelope: { ...env, progress: last ? env.progress : null, messages: serializeMessages(pieces[i]) },
      };
      await coexistenceSyncQueue.add("history-chunk", job);
    }
  }
}
