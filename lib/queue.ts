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
// Avisos de IndexNow (lib/seo/indexnow.ts): al arrancar y una vez al día. Sin reintentos de BullMQ: el siguiente tick reintenta.
export const seoQueue = new Queue("seo-indexnow", { connection, defaultJobOptions: { ...defaultJobOptions, attempts: 1 } });
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

// Bus de eventos de dominio (lib/events): un job por evento; el worker lo
// reparte a los webhooks que coinciden (y a automatizaciones en la fase 2).
export const domainEventQueue = new Queue("domain-events", {
  connection,
  defaultJobOptions: { ...defaultJobOptions, removeOnComplete: { count: 500 } },
});
// Motor de automatizaciones: un job por avance de ejecución ({ runId }), con
// delay para las esperas de tiempo. Sin reintentos de BullMQ: los fallos de
// envío los maneja el runner (backoff propio en la ejecución) y un error
// inesperado deja la ejecución FAILED con su mensaje.
export const automationRunQueue = new Queue("automation-run", {
  connection,
  defaultJobOptions: { removeOnComplete: { count: 500 }, removeOnFail: { count: 200 }, attempts: 1 },
});
// Respaldo cada minuto: esperas vencidas cuyo job diferido se perdió y
// timeouts de "esperar respuesta".
export const automationTickQueue = new Queue("automation-tick", { connection, defaultJobOptions });
// Coexistencia de WhatsApp: pedir a Meta la sincronización (contactos e
// historial) dentro de las 24 h del alta y procesar los lotes de historial /
// contactos que llegan por webhook (pueden ser miles de mensajes, se encolan en
// vez de procesarse dentro de la petición de Meta). 5 intentos: cada petición a
// Meta solo se puede hacer una vez, el reintento retoma donde quedó.
export const coexistenceSyncQueue = new Queue("coexistence-sync", {
  connection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 5, backoff: { type: "exponential" as const, delay: 5000 } },
});
// Vigilancia de coexistencia cada 15 min: sincronizaciones por vencer, token de
// negocio por vencer.
export const coexistenceTickQueue = new Queue("coexistence-tick", { connection, defaultJobOptions });
// Facturación cada hora: pruebas y gracias vencidas → solo lectura, avisos.
// Respaldo de la plataforma: "tick" repetible (¿toca el programado?) y "run" manual.
// Sin reintentos de BullMQ: el tick reintenta con su propia lógica (lib/backups/schedule.ts).
export const platformBackupQueue = new Queue("platform-backup", { connection, defaultJobOptions: { ...defaultJobOptions, attempts: 1 } });

// Doctor de plataforma: una corrida diaria; guarda PlatformHealthRun y avisa
// solo cuando un check cambia. Sin reintentos de BullMQ (ya corre a diario).
export const platformHealthQueue = new Queue("platform-health", { connection, defaultJobOptions: { ...defaultJobOptions, attempts: 1 } });

export const billingTickQueue = new Queue("billing-tick", { connection, defaultJobOptions });

// Operación de la bandeja (lib/inbox/): "tick" repetible cada 15 min
// (auto-resolver) y jobs puntuales por nombre ("away-message", "transcribe").
// Sin reintentos de BullMQ: cada job es idempotente y el tick vuelve a pasar;
// reintentar un envío podría duplicar un mensaje al cliente.
export const inboxQueue = new Queue("inbox", { connection, defaultJobOptions: { ...defaultJobOptions, attempts: 1 } });
// Una entrega HTTP por job, jobId = WebhookDelivery.id. Backoff largo a
// propósito: el receptor suele estar caído por minutos, no por segundos
// (6 intentos: esperas de 30s, 1m, 2m, 4m y 8m ≈ 15 min en total).
export { WEBHOOK_DELIVERY_ATTEMPTS } from "@/lib/api/constants";
import { WEBHOOK_BACKOFF_BASE_MS, WEBHOOK_DELIVERY_ATTEMPTS } from "@/lib/api/constants";
export const webhookDeliveryQueue = new Queue("webhook-deliveries", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
    attempts: WEBHOOK_DELIVERY_ATTEMPTS,
    backoff: { type: "exponential" as const, delay: WEBHOOK_BACKOFF_BASE_MS },
  },
});
