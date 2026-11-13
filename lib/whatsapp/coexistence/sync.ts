import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { requestSmbAppData } from "@/lib/whatsapp/embedded-signup/meta";
import { notifyAccountAdmins } from "./notify";
import { applyHistoryMedia, applyStateSyncContacts, ingestBusinessAppMessages } from "./ingest";
import { nextSyncAction, syncAfterHistory, tokenAlertFor, TOKEN_WARNING_DAYS } from "./state";
import type { HistoryEnvelope, NormalizedBusinessMessage, NormalizedHistoryMedia, NormalizedStateSyncContact } from "./normalize";

// Orquestación (con base de datos) de la sincronización de coexistencia. Las
// reglas de decisión viven en ./state.ts y están probadas sin base de datos.

// Pide a Meta los contactos y luego el historial de la app WhatsApp Business.
// Idempotente: cada petición solo puede hacerse una vez por conexión, así que el
// estado se guarda justo después de cada una y un reintento retoma donde quedó.
export async function runCoexistenceSync(accountId: string, now = new Date()): Promise<"contacts" | "history" | "expired" | "skipped"> {
  const account = await prisma.wAAccount.findUnique({
    where: { id: accountId },
    select: { id: true, organizationId: true, name: true, phoneNumberId: true, accessToken: true, coexistence: true, status: true, syncStatus: true, syncDeadlineAt: true, syncRequestIds: true },
  });
  if (!account || !account.coexistence || account.status !== "CONNECTED" || !account.phoneNumberId || !account.accessToken) return "skipped";

  const token = decrypt(account.accessToken);
  const ids = (account.syncRequestIds ?? {}) as { contacts?: string | null; history?: string | null };
  let status = account.syncStatus;
  let last: "contacts" | "history" | "expired" | "skipped" = "skipped";

  // Contactos y, enseguida, historial en el mismo job: cada paso se guarda justo
  // después de pedirlo, así un reintento retoma donde quedó sin repetir lo que
  // Meta ya aceptó (solo permite cada petición una vez por conexión).
  for (let step = 0; step < 2; step++) {
    const action = nextSyncAction(status, account.syncDeadlineAt, now);
    if (action === "none") break;
    if (action === "expire") {
      await expireSync(account);
      return "expired";
    }

    if (action === "contacts") {
      const requestId = await requestSmbAppData(account.phoneNumberId, token, "smb_app_state_sync");
      ids.contacts = requestId;
      // Condición sobre el estado anterior: si otro job ya avanzó, no se pisa.
      const moved = await prisma.wAAccount.updateMany({
        where: { id: account.id, syncStatus: "PENDING" },
        data: { syncStatus: "CONTACTS_REQUESTED", syncRequestIds: { ...ids }, syncError: null },
      });
      if (moved.count === 0) break;
      status = "CONTACTS_REQUESTED";
      last = "contacts";
    } else {
      const requestId = await requestSmbAppData(account.phoneNumberId, token, "history");
      ids.history = requestId;
      await prisma.wAAccount.updateMany({
        where: { id: account.id, syncStatus: "CONTACTS_REQUESTED" },
        data: { syncStatus: "HISTORY_REQUESTED", syncProgress: 0, syncRequestIds: { ...ids }, syncError: null },
      });
      status = "HISTORY_REQUESTED";
      last = "history";
    }
  }
  return last;
}

async function expireSync(account: { id: string; organizationId: string; name: string }): Promise<void> {
  const updated = await prisma.wAAccount.updateMany({
    where: { id: account.id, syncStatus: { in: ["PENDING", "CONTACTS_REQUESTED"] } },
    data: {
      syncStatus: "EXPIRED",
      syncError: "Pasaron 24 horas sin completar la sincronización con la app WhatsApp Business.",
    },
  });
  if (updated.count === 0) return;
  await notifyAccountAdmins(account.organizationId, {
    accountId: account.id,
    title: `"${account.name}": sincronización vencida`,
    body: "Meta da 24 horas para sincronizar contactos e historial de la app WhatsApp Business. Para repetirla hay que desconectar el número y volver a conectarlo.",
  });
}

// Un fallo definitivo del job de sincronización (se agotaron los reintentos).
export async function markSyncFailed(accountId: string, error: string): Promise<void> {
  const account = await prisma.wAAccount.findUnique({ where: { id: accountId }, select: { id: true, organizationId: true, name: true, syncStatus: true } });
  if (!account || !["PENDING", "CONTACTS_REQUESTED"].includes(account.syncStatus)) return;
  // No se marca FAILED mientras haya tiempo: el tick lo vuelve a intentar hasta
  // el límite de 24 h. Solo se registra el último error.
  await prisma.wAAccount.update({ where: { id: accountId }, data: { syncError: error.slice(0, 300) } });
}

// ---- Webhooks diferidos (la carga puede ser de miles de mensajes) ----------

export interface SerializedMessage extends Omit<NormalizedBusinessMessage, "timestamp"> {
  timestamp: string;
}
export interface SerializedContact extends Omit<NormalizedStateSyncContact, "changedAt"> {
  changedAt: string;
}

export const serializeMessages = (m: NormalizedBusinessMessage[]): SerializedMessage[] => m.map((x) => ({ ...x, timestamp: x.timestamp.toISOString() }));
export const reviveMessages = (m: SerializedMessage[]): NormalizedBusinessMessage[] => m.map((x) => ({ ...x, timestamp: new Date(x.timestamp) }));
export const serializeContacts = (c: NormalizedStateSyncContact[]): SerializedContact[] => c.map((x) => ({ ...x, changedAt: x.changedAt.toISOString() }));
export const reviveContacts = (c: SerializedContact[]): NormalizedStateSyncContact[] => c.map((x) => ({ ...x, changedAt: new Date(x.changedAt) }));

export type HistoryChunkJob = {
  accountId: string;
  envelope: Exclude<HistoryEnvelope, { kind: "chunk" }> | { kind: "chunk"; phase: number | null; chunkOrder: number | null; progress: number | null; messages: SerializedMessage[] };
};

export async function processHistoryChunk(job: HistoryChunkJob): Promise<void> {
  const env: HistoryEnvelope = job.envelope.kind === "chunk" ? { ...job.envelope, messages: reviveMessages(job.envelope.messages) } : job.envelope;
  if (env.kind === "chunk" && env.messages.length > 0) {
    await ingestBusinessAppMessages(job.accountId, env.messages, "HISTORY");
  }
  const account = await prisma.wAAccount.findUnique({ where: { id: job.accountId }, select: { syncStatus: true, syncProgress: true } });
  if (!account) return;
  const next = syncAfterHistory({ status: account.syncStatus, progress: account.syncProgress }, env);
  await prisma.wAAccount.update({
    where: { id: job.accountId },
    data: { syncStatus: next.status, syncProgress: next.progress, ...(next.error ? { syncError: next.error.slice(0, 300) } : {}) },
  });
}

export type HistoryMediaJob = { accountId: string; items: NormalizedHistoryMedia[] };

export class HistoryMediaPendingError extends Error {}

// El medio puede llegar antes de que la cola guarde el lote con su placeholder
// (misma cola, concurrencia 1: normalmente llega después). Si falta alguno, el
// job falla y BullMQ lo reintenta con backoff; lo ya aplicado se salta solo.
export async function processHistoryMedia(job: HistoryMediaJob): Promise<void> {
  const res = await applyHistoryMedia(job.accountId, job.items);
  if (res.missing.length > 0) {
    throw new HistoryMediaPendingError(`${res.missing.length} medio(s) del historial sin su mensaje todavía: ${res.missing.slice(0, 3).join(", ")}`);
  }
}

export async function processStateSyncChunk(accountId: string, contacts: SerializedContact[]): Promise<void> {
  await applyStateSyncContacts(accountId, reviveContacts(contacts));
}

// ---- Vigilancia periódica ---------------------------------------------------

const RETRY_AFTER_MINUTES = 10;

export async function processCoexistenceTick(
  enqueueSync: (accountId: string) => Promise<void>,
  now = new Date()
): Promise<{ retried: number; expired: number; tokenAlerts: number }> {
  let retried = 0;
  let expired = 0;
  let tokenAlerts = 0;

  // 1) Sincronizaciones sin terminar de pedir: reintentar o vencer.
  const pending = await prisma.wAAccount.findMany({
    where: { coexistence: true, status: "CONNECTED", syncStatus: { in: ["PENDING", "CONTACTS_REQUESTED"] } },
    select: { id: true, organizationId: true, name: true, syncStatus: true, syncDeadlineAt: true, updatedAt: true },
    take: 100,
  });
  for (const a of pending) {
    const action = nextSyncAction(a.syncStatus, a.syncDeadlineAt, now);
    if (action === "expire") {
      await expireSync(a);
      expired++;
    } else if (action !== "none" && now.getTime() - a.updatedAt.getTime() > RETRY_AFTER_MINUTES * 60_000) {
      await enqueueSync(a.id);
      retried++;
    }
  }

  // 2) Token de negocio por vencer o vencido.
  const withToken = await prisma.wAAccount.findMany({
    where: { connectionType: "EMBEDDED_SIGNUP", tokenExpiresAt: { not: null }, status: "CONNECTED" },
    select: { id: true, organizationId: true, name: true, tokenExpiresAt: true, tokenAlertedAt: true },
    take: 500,
  });
  for (const a of withToken) {
    const alert = tokenAlertFor(now, a.tokenExpiresAt, a.tokenAlertedAt);
    if (alert === "none") continue;
    if (alert === "expired") {
      await prisma.wAAccount.update({
        where: { id: a.id },
        data: { status: "ERROR", errorMessage: "El acceso a WhatsApp venció. Vuelve a conectar el número para restablecerlo.", tokenAlertedAt: now },
      });
      await notifyAccountAdmins(a.organizationId, { accountId: a.id, title: `"${a.name}": el acceso a WhatsApp venció`, body: "Vuelve a conectar el número desde Cuentas WhatsApp para seguir enviando y recibiendo mensajes." });
    } else {
      await prisma.wAAccount.update({ where: { id: a.id }, data: { tokenAlertedAt: now } });
      await notifyAccountAdmins(a.organizationId, { accountId: a.id, title: `"${a.name}": el acceso a WhatsApp vence pronto`, body: `Vence en menos de ${TOKEN_WARNING_DAYS} días. Vuelve a conectar el número desde Cuentas WhatsApp antes de esa fecha.` });
    }
    tokenAlerts++;
  }
  return { retried, expired, tokenAlerts };
}
