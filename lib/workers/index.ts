import { Worker } from "bullmq";
import { processBotMessageJob } from "./bot-worker";
import { processTelegramBotMessageJob } from "@/lib/telegram/bot-worker";
import { processMetaChannelBotMessageJob } from "@/lib/meta-messaging/bot-worker";
import { processCampaignJob, processScheduledCampaignsTick } from "./campaign-worker";
import { processRagJob } from "./rag-worker";
import { processMediaDownloadJob } from "./media-worker";
import { processMediaCleanupJob } from "./media-cleanup-worker";
import { processBotSendJob } from "./bot-send-worker";
import { processLeadScoringTick } from "./lead-scoring-worker";
import { processLeadRecoveryTick } from "./lead-recovery-worker";
import { processSheetsSyncTick } from "./sheets-sync-worker";
import { processLeadSheetImportTick } from "./lead-sheet-worker";
import { processMetaConversionsJob } from "./meta-conversions-worker";
import { processAppointmentReminderTick } from "./appointment-reminder-worker";
import { processSequenceTickJob } from "./sequence-worker";
import { fanOutToWebhooks } from "@/lib/webhooks/fanout";
import { processWebhookDelivery } from "@/lib/webhooks/deliver";
import type { DomainEvent } from "@/lib/events/types";
import { handleDomainEvent as handleAutomationEvent } from "@/lib/automations/dispatch";
import { processAutomationTick, wakeRun } from "@/lib/automations/runner";
import { processBillingTick } from "@/lib/billing/tick";
import { mediaCleanupQueue, leadScoringQueue, leadRecoveryQueue, campaignQueue, campaignScheduleQueue, sheetsSyncQueue, leadSheetImportQueue, appointmentReminderQueue, sequenceQueue, automationTickQueue, billingTickQueue } from "@/lib/queue";

const connection = {
  url: process.env.REDIS_URL || "redis://redis:6379",
};

let started = false;
const workers: Worker[] = [];

export function startWorkers() {
  if (started) return;
  started = true;

  const botWorker = new Worker("bot-messages", async (job) => {
    const attemptInfo = { attemptsMade: job.attemptsMade, maxAttempts: job.opts.attempts ?? 1 };
    // El productor decide la forma del payload: lib/whatsapp/ingest-message.ts
    // (WhatsApp) no manda `channel`, lib/telegram/ingest-message.ts (Telegram/
    // Messenger/Instagram, ver ChannelAccount) sí lo manda explícito.
    switch (job.data.channel) {
      case "TELEGRAM":
      // Roadmap P3-f — el widget de chat en vivo reutiliza el bot-worker de
      // Telegram tal cual (mismo perfil simple: texto plano, sin ventana de
      // servicio); la única bifurcación real de envío vive en
      // lib/channel-send.ts, no aquí.
      case "WEBCHAT":
        await processTelegramBotMessageJob(job.data, attemptInfo);
        break;
      case "MESSENGER":
      case "INSTAGRAM":
        await processMetaChannelBotMessageJob(job.data, attemptInfo);
        break;
      default:
        await processBotMessageJob(job.data, attemptInfo);
    }
  }, { connection, concurrency: 3 });

  const campaignWorker = new Worker("campaign-send", async (job) => {
    // Un "scheduled-tick" viejo que haya quedado en esta cola (antes el tick
    // vivía aquí) se procesa igual: el reclamo de campañas es atómico
    // (updateMany condicionado a SCHEDULED), así que correr en ambas colas no
    // duplica envíos.
    if (job.name === "scheduled-tick") {
      await processScheduledCampaignsTick();
      return;
    }
    await processCampaignJob(job.data);
  }, { connection, concurrency: 1 });

  const campaignScheduleWorker = new Worker("campaign-schedule-tick", async () => {
    await processScheduledCampaignsTick();
  }, { connection, concurrency: 1 });

  const ragWorker = new Worker("rag-index", async (job) => {
    await processRagJob(job.data);
  }, { connection, concurrency: 2 });

  const mediaWorker = new Worker("media-download", async (job) => {
    await processMediaDownloadJob(job.data);
  }, { connection, concurrency: 5 });

  const mediaCleanupWorker = new Worker("media-cleanup", async () => {
    await processMediaCleanupJob();
  }, { connection, concurrency: 1 });

  const botSendWorker = new Worker("bot-message-send", async (job) => {
    await processBotSendJob(job.data);
  }, { connection, concurrency: 5 });

  const leadScoringWorker = new Worker("lead-scoring", async () => {
    await processLeadScoringTick();
  }, { connection, concurrency: 1 });

  const leadRecoveryWorker = new Worker("lead-recovery", async () => {
    await processLeadRecoveryTick();
  }, { connection, concurrency: 1 });

  const sheetsSyncWorker = new Worker("sheets-sync", async () => {
    await processSheetsSyncTick();
  }, { connection, concurrency: 1 });

  const leadSheetImportWorker = new Worker("lead-sheet-import", async () => {
    await processLeadSheetImportTick();
  }, { connection, concurrency: 1 });

  // Cola de trabajo por job (no tick) — el productor es el PATCH de
  // /api/whatsapp/contacts/[id], un job por cambio de leadStatus. Mismo
  // shape que bot-message-send.
  const metaConversionsWorker = new Worker("meta-conversions", async (job) => {
    await processMetaConversionsJob(job.data);
  }, { connection, concurrency: 5 });

  const appointmentReminderWorker = new Worker("appointment-reminders", async () => {
    await processAppointmentReminderTick();
  }, { connection, concurrency: 1 });

  const sequenceWorker = new Worker("sequence-tick", async () => {
    await processSequenceTickJob();
  }, { connection, concurrency: 1 });

  // Bus de eventos de dominio (lib/events) — reparte cada evento a los
  // webhooks salientes que coinciden.
  const domainEventWorker = new Worker("domain-events", async (job) => {
    const event = job.data as DomainEvent;
    await fanOutToWebhooks(event);
    await handleAutomationEvent(event);
  }, { connection, concurrency: 5 });

  // Motor de automatizaciones: avances de ejecución y tick de respaldo.
  const automationRunWorker = new Worker("automation-run", async (job) => {
    await wakeRun(job.data.runId as string);
  }, { connection, concurrency: 5 });
  const automationTickWorker = new Worker("automation-tick", async () => {
    await processAutomationTick();
  }, { connection, concurrency: 1 });

  const billingTickWorker = new Worker("billing-tick", async () => {
    await processBillingTick();
  }, { connection, concurrency: 1 });

  // Una entrega HTTP por job; los reintentos (backoff largo) los maneja
  // BullMQ, el registro de cada intento vive en WebhookDelivery.
  const webhookDeliveryWorker = new Worker("webhook-deliveries", async (job) => {
    await processWebhookDelivery(job);
  }, { connection, concurrency: 5 });

  workers.push(botWorker, campaignWorker, campaignScheduleWorker, ragWorker, mediaWorker, mediaCleanupWorker, botSendWorker, leadScoringWorker, leadRecoveryWorker, sheetsSyncWorker, leadSheetImportWorker, metaConversionsWorker, appointmentReminderWorker, sequenceWorker, domainEventWorker, webhookDeliveryWorker, automationRunWorker, automationTickWorker, billingTickWorker);

  mediaCleanupQueue
    .add(
      "purge",
      {},
      { jobId: "media-cleanup-daily", repeat: { pattern: "0 3 * * *" } }
    )
    .catch((err) => console.error("[workers] No se pudo programar media-cleanup:", err));

  // The shortest schedulable interval a scorer can pick is 15 minutes (see
  // LEAD_SCORER_SCHEDULE_INTERVALS) — ticking every 5 minutes gives enough
  // resolution to honor that without polling Redis unnecessarily often.
  leadScoringQueue
    .add(
      "tick",
      {},
      { jobId: "lead-scoring-tick", repeat: { pattern: "*/5 * * * *" } }
    )
    .catch((err) => console.error("[workers] No se pudo programar lead-scoring:", err));

  // Las campañas programadas se agendan a minuto exacto en la UI — un tick
  // por minuto es la resolución mínima para honrar esa promesa.
  campaignScheduleQueue
    .add(
      "scheduled-tick",
      {},
      { jobId: "campaign-scheduled-tick", repeat: { pattern: "* * * * *" } }
    )
    .catch((err) => console.error("[workers] No se pudo programar campaign-scheduled-tick:", err));
  // Quita el repetible que vivía en campaign-send antes de separar las colas.
  campaignQueue
    .removeRepeatable("scheduled-tick", { pattern: "* * * * *" }, "campaign-scheduled-tick")
    .catch((err) => console.error("[workers] No se pudo quitar el tick viejo de campaign-send:", err));

  // Umbrales en horas (mínimo configurable: horas enteras) — un tick cada 15
  // minutos da resolución de sobra sin sondear Redis de más.
  leadRecoveryQueue
    .add(
      "tick",
      {},
      { jobId: "lead-recovery-tick", repeat: { pattern: "*/15 * * * *" } }
    )
    .catch((err) => console.error("[workers] No se pudo programar lead-recovery:", err));

  // Mismo cron que lead-recovery — resolución de sobra para una sync que no
  // necesita ser casi en tiempo real.
  sheetsSyncQueue
    .add(
      "tick",
      {},
      { jobId: "sheets-sync-tick", repeat: { pattern: "*/15 * * * *" } }
    )
    .catch((err) => console.error("[workers] No se pudo programar sheets-sync:", err));

  // Un lead de Facebook Ads espera respuesta rápida — mismo cron que lead-scoring
  // (5 min) para no dejarlo esperando de más, acotado por MAX_ROWS_PER_TICK en
  // lib/google/lead-sheet-import.ts para no saturar la API de Meta en una ráfaga.
  leadSheetImportQueue
    .add(
      "tick",
      {},
      { jobId: "lead-sheet-import-tick", repeat: { pattern: "*/5 * * * *" } }
    )
    .catch((err) => console.error("[workers] No se pudo programar lead-sheet-import:", err));

  // reminderMinutesBefore por defecto es 60 (mínimo configurable en horas
  // enteras equivalente sería demasiado grueso) — un tick cada 5 minutos deja
  // margen de sobra (±5 min) sin sondear Redis de más, mismo cron que
  // lead-scoring/lead-sheet-import.
  appointmentReminderQueue
    .add(
      "tick",
      {},
      { jobId: "appointment-reminder-tick", repeat: { pattern: "*/5 * * * *" } }
    )
    .catch((err) => console.error("[workers] No se pudo programar appointment-reminders:", err));

  // delayMinutes de un paso es granularidad de minuto — mismo cron de 5 min
  // que appointment-reminders/lead-scoring da margen de sobra.
  sequenceQueue
    .add(
      "tick",
      {},
      { jobId: "sequence-tick", repeat: { pattern: "*/5 * * * *" } }
    )
    .catch((err) => console.error("[workers] No se pudo programar sequence-tick:", err));

  // Esperas de "esperar respuesta" y respaldo de esperas de tiempo: minuto a
  // minuto, la resolución mínima que el editor permite configurar.
  automationTickQueue
    .add(
      "tick",
      {},
      { jobId: "automation-tick", repeat: { pattern: "* * * * *" } }
    )
    .catch((err) => console.error("[workers] No se pudo programar automation-tick:", err));

  // Facturación: al minuto 7 de cada hora (lejos de los ticks de :00).
  billingTickQueue
    .add("tick", {}, { jobId: "billing-tick", repeat: { pattern: "7 * * * *" } })
    .catch((err) => console.error("[workers] No se pudo programar billing-tick:", err));

  console.log("[workers] BullMQ workers started");
}

async function shutdown() {
  console.log("[workers] Shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  console.log("[workers] Workers shut down");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
