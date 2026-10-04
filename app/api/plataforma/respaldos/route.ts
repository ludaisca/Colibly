import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getPlatformSettings, invalidatePlatformSettingsCache, updatePlatformSettings, type PlatformSettingsInput } from "@/lib/platform-settings";
import { platformBackupQueue } from "@/lib/queue";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { BACKUP_TIME_ZONE, objectKeys, resolveBackupConfig, validateEndpoint } from "@/lib/backups/config";
import { decideBackup } from "@/lib/backups/schedule";
import { reapStaleBackupRuns } from "@/lib/backups/runner";
import { testConnection } from "@/lib/backups/s3";

// Respaldo diario de la plataforma — solo operadores (requirePlatformAdmin, 404
// al resto). La configuración vive en PlatformSettings; los secretos nunca se
// devuelven, solo si están configurados (mismo patrón que /configuracion).

const secret = z.string().min(1).max(500).nullable().optional();

const updateSchema = z.object({
  backupEnabled: z.boolean().optional(),
  backupEndpoint: z.string().trim().max(300).nullable().optional(),
  backupRegion: z.string().trim().max(60).nullable().optional(),
  backupBucket: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, "Nombre de bucket no válido (3-63 caracteres: minúsculas, números, punto y guion)")
    .nullable()
    .optional(),
  backupPrefix: z.string().trim().max(120).nullable().optional(),
  backupAccessKeyId: secret,
  backupSecretAccessKey: secret,
  backupHour: z.number().int().min(0).max(23).optional(),
  backupIncludeMedia: z.boolean().optional(),
});

const actionSchema = z.object({ action: z.enum(["test", "run"]) });

const isProduction = () => process.env.NODE_ENV === "production";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  await reapStaleBackupRuns();
  const [s, runs] = await Promise.all([
    getPlatformSettings(),
    prisma.platformBackupRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
  ]);

  const lastSuccess = runs.find((r) => r.status === "SUCCESS") ?? null;
  const running = runs.some((r) => r.status === "RUNNING");

  // Próximo respaldo programado: ahora mismo si el horario vigente aún no se cumplió, o el siguiente.
  let nextRunAt: string | null = null;
  if (s.backupEnabled) {
    const decision = decideBackup({
      now: new Date(),
      hour: s.backupHour,
      timeZone: BACKUP_TIME_ZONE,
      runs: runs.map((r) => ({ trigger: r.trigger, status: r.status, startedAt: r.startedAt })),
    });
    nextRunAt = decision.due ? new Date().toISOString() : new Date(decision.slot.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  return NextResponse.json({
    config: {
      enabled: s.backupEnabled,
      endpoint: s.backupEndpoint,
      region: s.backupRegion,
      bucket: s.backupBucket,
      prefix: s.backupPrefix,
      hasAccessKeyId: !!s.backupAccessKeyId,
      hasSecretAccessKey: !!s.backupSecretAccessKey,
      hour: s.backupHour,
      includeMedia: s.backupIncludeMedia,
    },
    objectKeys: objectKeys(s.backupPrefix),
    timeZone: BACKUP_TIME_ZONE,
    running,
    nextRunAt,
    lastSuccessAt: lastSuccess?.finishedAt ?? null,
    runs: runs.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      dbBytes: r.dbBytes === null ? null : Number(r.dbBytes),
      mediaBytes: r.mediaBytes === null ? null : Number(r.mediaBytes),
      error: r.error,
      triggeredBy: r.triggeredBy,
    })),
  });
}

export async function PATCH(req: Request) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;

  if (input.backupEndpoint) {
    const problem = validateEndpoint(input.backupEndpoint, isProduction());
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  // Cadenas vacías = campo borrado.
  const normalized: PlatformSettingsInput = {
    ...input,
    ...(input.backupEndpoint !== undefined ? { backupEndpoint: input.backupEndpoint || null } : {}),
    ...(input.backupRegion !== undefined ? { backupRegion: input.backupRegion || null } : {}),
    ...(input.backupPrefix !== undefined ? { backupPrefix: input.backupPrefix || null } : {}),
  };

  // No se puede activar el respaldo con la configuración incompleta.
  if (input.backupEnabled) {
    const current = await getPlatformSettings();
    const merged = { ...current, ...Object.fromEntries(Object.entries(normalized).filter(([, v]) => v !== undefined)) };
    const resolved = resolveBackupConfig(merged as typeof current);
    if (!resolved.ok) return NextResponse.json({ error: `Para activar el respaldo falta: ${resolved.missing.join(", ")}.` }, { status: 400 });
  }

  try {
    await updatePlatformSettings(normalized, admin.email);
    console.log(`[plataforma] ${admin.email} → actualizó respaldos (${Object.keys(input).join(", ")})`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo guardar la configuración de respaldos") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Acción no válida" }, { status: 400 });

  const { allowed } = await rateLimit(`platform-backup:${parsed.data.action}:${admin.userId}`, 10, 3600);
  if (!allowed) return NextResponse.json({ error: "Demasiados intentos, espera un momento" }, { status: 429 });

  invalidatePlatformSettingsCache();
  const resolved = resolveBackupConfig(await getPlatformSettings());
  if (!resolved.ok) return NextResponse.json({ error: `Falta configurar: ${resolved.missing.join(", ")}.` }, { status: 400 });

  if (parsed.data.action === "test") {
    const result = await testConnection(resolved.config);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }

  await reapStaleBackupRuns();
  if (await prisma.platformBackupRun.findFirst({ where: { status: "RUNNING" }, select: { id: true } })) {
    return NextResponse.json({ error: "Ya hay un respaldo en curso" }, { status: 409 });
  }
  await platformBackupQueue.add("run", { triggeredBy: admin.email }, { jobId: `platform-backup-run-${Date.now()}` });
  console.log(`[plataforma] ${admin.email} → pidió un respaldo manual`);
  return NextResponse.json({ queued: true }, { status: 202 });
}
