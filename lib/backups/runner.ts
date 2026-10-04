import { existsSync } from "node:fs";
import type { PlatformBackupTrigger } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings, invalidatePlatformSettingsCache } from "@/lib/platform-settings";
import { listPlatformAdminEmails } from "@/lib/platform-admin";
import { sendEmailSafely } from "@/lib/email/mailer";
import { billingNoticeTemplate } from "@/lib/email/templates";
import { appUrl } from "@/lib/app-url";
import { resolveBackupConfig, objectKeys, BACKUP_TIME_ZONE } from "./config";
import { pgConnectionFromUrl } from "./pg-connection";
import { runCommandToSink, type StreamStats } from "./stream";
import { createS3Client, uploadStream, putJson, objectSize } from "./s3";
import { describeS3Error, redactSecrets } from "./errors";
import { BACKUP_MAX_ATTEMPTS_PER_SLOT, currentBackupSlot, decideBackup, isStaleRun } from "./schedule";

// Respaldo diario: pg_dump (formato custom, comprimido) → S3 en streaming, sin
// archivos temporales; opcionalmente los medios en un .tar.gz. Cada respaldo
// SOBRESCRIBE al anterior (claves fijas, ver objectKeys). La subida solo se
// completa si pg_dump termina bien (lib/backups/stream.ts), así que un fallo a
// medias deja intacto el respaldo bueno de ayer.

const RUN_HISTORY_DAYS = 90;
const SYSTEM_ENV = () => ({ PATH: process.env.PATH ?? "/usr/bin:/bin" });

export class BackupAlreadyRunningError extends Error {
  constructor() {
    super("Ya hay un respaldo en curso");
  }
}

function mediaRoot(): string {
  return process.env.MEDIA_ROOT || "/app/media";
}

// Respaldos "en curso" abandonados (el contenedor se reinició a medias): se
// marcan como fallidos para que no bloqueen a los siguientes.
export async function reapStaleBackupRuns(now = new Date()): Promise<void> {
  const running = await prisma.platformBackupRun.findMany({ where: { status: "RUNNING" }, select: { id: true, startedAt: true } });
  for (const run of running) {
    if (isStaleRun(run.startedAt, now)) {
      await prisma.platformBackupRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: now, error: "Interrumpido: el servidor se reinició o el respaldo se colgó." },
      });
    }
  }
}

async function lastAppliedMigration(): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
    return rows[0]?.migration_name ?? null;
  } catch {
    return null;
  }
}

export interface BackupResult {
  runId: string;
  dbBytes: number;
  mediaBytes: number | null;
}

export async function runBackup(opts: { trigger: PlatformBackupTrigger; triggeredBy?: string }): Promise<BackupResult> {
  await reapStaleBackupRuns();
  if (await prisma.platformBackupRun.findFirst({ where: { status: "RUNNING" }, select: { id: true } })) {
    throw new BackupAlreadyRunningError();
  }

  const run = await prisma.platformBackupRun.create({ data: { trigger: opts.trigger, triggeredBy: opts.triggeredBy ?? null } });
  invalidatePlatformSettingsCache();
  const settings = await getPlatformSettings();
  const secrets: Array<string | null> = [settings.backupAccessKeyId, settings.backupSecretAccessKey, null];

  try {
    const resolved = resolveBackupConfig(settings);
    if (!resolved.ok) throw new Error(`Configuración incompleta: falta ${resolved.missing.join(", ")}.`);
    const { config } = resolved;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("Falta DATABASE_URL en el entorno del servidor.");
    const pg = pgConnectionFromUrl(databaseUrl);
    secrets[2] = pg.PGPASSWORD;

    const keys = objectKeys(config.prefix);
    const client = createS3Client(config);
    try {
      const startedAt = new Date();
      const migration = await lastAppliedMigration();

      const db: StreamStats = await runCommandToSink({
        command: "pg_dump",
        args: ["--format=custom", "--no-owner", "--no-privileges", "--lock-wait-timeout=60000"],
        env: { ...SYSTEM_ENV(), ...pg },
        sink: (body) => uploadStream(client, config.bucket, keys.db, body, "application/octet-stream"),
      });
      // Confirmar que lo que quedó en el bucket pesa lo mismo que lo que salió de pg_dump.
      const stored = await objectSize(client, config.bucket, keys.db);
      if (stored !== db.bytes) throw new Error(`El respaldo subido pesa ${stored} bytes y pg_dump produjo ${db.bytes}.`);

      let media: StreamStats | null = null;
      if (config.includeMedia && existsSync(mediaRoot())) {
        media = await runCommandToSink({
          command: "tar",
          args: ["-czf", "-", "-C", mediaRoot(), "."],
          env: SYSTEM_ENV(),
          sink: (body) => uploadStream(client, config.bucket, keys.media, body, "application/gzip"),
        });
        const storedMedia = await objectSize(client, config.bucket, keys.media);
        if (storedMedia !== media.bytes) throw new Error(`Los medios subidos pesan ${storedMedia} bytes y tar produjo ${media.bytes}.`);
      }

      await putJson(client, config.bucket, keys.manifest, {
        formatVersion: 1,
        createdAt: startedAt.toISOString(),
        trigger: opts.trigger,
        lastMigration: migration,
        database: { key: keys.db, format: "pg_dump custom (-Fc)", bytes: db.bytes, sha256: db.sha256 },
        media: media ? { key: keys.media, format: "tar.gz", bytes: media.bytes, sha256: media.sha256 } : null,
        nota: "Los secretos guardados en la base están cifrados con ENCRYPTION_KEY: sin esa clave, restaurar la base no recupera tokens ni credenciales.",
      });

      await prisma.platformBackupRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), dbBytes: BigInt(db.bytes), mediaBytes: media ? BigInt(media.bytes) : null },
      });
      return { runId: run.id, dbBytes: db.bytes, mediaBytes: media?.bytes ?? null };
    } finally {
      client.destroy();
    }
  } catch (err) {
    const raw = err instanceof Error && err.name !== "Error" && "$metadata" in err ? describeS3Error(err) : err instanceof Error ? err.message : String(err);
    const message = redactSecrets(raw, secrets).slice(0, 1500);
    await prisma.platformBackupRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: message } });
    console.error(`[respaldos] falló (${opts.trigger}): ${message}`);
    if (opts.trigger === "SCHEDULED") await alertIfGivingUp(settings.backupHour, message);
    throw err;
  } finally {
    await prisma.platformBackupRun
      .deleteMany({ where: { startedAt: { lt: new Date(Date.now() - RUN_HISTORY_DAYS * 24 * 60 * 60 * 1000) } } })
      .catch(() => {});
  }
}

// Avisa por correo al operador cuando se agotan los intentos del horario: un
// respaldo que falla en silencio es peor que no tenerlo.
async function alertIfGivingUp(hour: number, lastError: string): Promise<void> {
  const slot = currentBackupSlot(new Date(), hour, BACKUP_TIME_ZONE);
  const failures = await prisma.platformBackupRun.count({ where: { trigger: "SCHEDULED", status: "FAILED", startedAt: { gte: slot } } });
  if (failures !== BACKUP_MAX_ATTEMPTS_PER_SLOT) return;
  for (const to of listPlatformAdminEmails()) {
    await sendEmailSafely(
      billingNoticeTemplate({
        to,
        title: "Falló el respaldo diario",
        paragraphs: [
          `El respaldo programado falló ${failures} veces seguidas y no se reintentará hasta el siguiente horario.`,
          `Último error: ${lastError.slice(0, 300)}`,
          "Revisa la configuración en Plataforma → Respaldos o prueba la conexión.",
        ],
        ctaLabel: "Abrir Respaldos",
        url: appUrl("/plataforma"),
      }),
      "alerta de respaldo"
    );
  }
}

// Tick de BullMQ (cada 15 min): decide si toca el respaldo programado.
export async function processBackupTick(now = new Date()): Promise<"disabled" | "skipped" | "ran"> {
  invalidatePlatformSettingsCache();
  const settings = await getPlatformSettings();
  if (!settings.backupEnabled) return "disabled";

  await reapStaleBackupRuns(now);
  const runs = await prisma.platformBackupRun.findMany({
    where: { startedAt: { gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } },
    select: { trigger: true, status: true, startedAt: true },
  });
  const decision = decideBackup({ now, hour: settings.backupHour, timeZone: BACKUP_TIME_ZONE, runs });
  if (!decision.due) return "skipped";

  try {
    await runBackup({ trigger: "SCHEDULED" });
  } catch (err) {
    // Ya quedó registrado y avisado; el reintento lo decide el siguiente tick.
    if (err instanceof BackupAlreadyRunningError) return "skipped";
  }
  return "ran";
}
