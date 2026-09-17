import { Queue } from "bullmq";

const connection = {
  url: process.env.REDIS_URL || "redis://redis:6379",
};

// Sin `timeout`: BullMQ 5 no tiene esa opción (se ignoraba en silencio). El
// límite de tiempo real vive en cada llamada HTTP — ver lib/http-timeouts.ts.
const defaultJobOptions = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
};

const mediaDownloadJobOptions = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 },
};

export const botQueue = new Queue("bot-messages", { connection, defaultJobOptions });
export const campaignQueue = new Queue("campaign-send", { connection, defaultJobOptions });
export const ragQueue = new Queue("rag-index", { connection, defaultJobOptions });
export const mediaDownloadQueue = new Queue("media-download", {
  connection,
  defaultJobOptions: mediaDownloadJobOptions,
});
export const mediaCleanupQueue = new Queue("media-cleanup", { connection, defaultJobOptions });
export const botSendQueue = new Queue("bot-message-send", { connection, defaultJobOptions });
export const leadScoringQueue = new Queue("lead-scoring", { connection, defaultJobOptions });
export const leadRecoveryQueue = new Queue("lead-recovery", { connection, defaultJobOptions });
export const sheetsSyncQueue = new Queue("sheets-sync", { connection, defaultJobOptions });
export const leadSheetImportQueue = new Queue("lead-sheet-import", { connection, defaultJobOptions });
// Llamada HTTP externa a Meta que puede fallar transitoriamente (rate limit,
// timeout de red) — más reintentos que el default, mismo criterio que
// mediaDownloadJobOptions.
const metaConversionsJobOptions = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 },
};
export const metaConversionsQueue = new Queue("meta-conversions", {
  connection,
  defaultJobOptions: metaConversionsJobOptions,
});
export const appointmentReminderQueue = new Queue("appointment-reminders", { connection, defaultJobOptions });
export const sequenceQueue = new Queue("sequence-tick", { connection, defaultJobOptions });
// Tick de campañas programadas en su propia cola: en campaign-send (concurrencia
// 1) quedaba esperando detrás de cualquier campaña en envío, y una campaña de
// miles de destinatarios retrasaba todas las programadas hasta terminar.
export const campaignScheduleQueue = new Queue("campaign-schedule-tick", { connection, defaultJobOptions });
